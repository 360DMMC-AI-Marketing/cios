const axios = require('axios');
const env = require('../config/env');
const Activity = require('../models/Activity');
const User = require('../models/User');

class MicrosoftGraphService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const { data } = await axios.post(
        `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;
      return this.accessToken;
    } catch (error) {
      console.error('Microsoft Graph auth error:', error.message);
      return null;
    }
  }

  async getClient() {
    const token = await this.getAccessToken();
    return axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async syncOutlookEmails(userEmail, userId, domain) {
    try {
      const client = await this.getClient();
      if (!client) return null;

      const { data } = await client.get(`/users/${userEmail}/messages`, {
        params: { $top: 20, $orderby: 'receivedDateTime desc', $select: 'id,subject,receivedDateTime,from' },
      });

      for (const email of data.value || []) {
        await Activity.create({
          user: userId,
          domain,
          type: 'outlook_email',
          source: 'outlook',
          description: `Email: ${email.subject}`,
          metadata: { messageId: email.id, from: email.from?.emailAddress?.address, received: email.receivedDateTime },
          score: 2,
        });
      }

      return { emails: data.value?.length || 0 };
    } catch (error) {
      console.error('Outlook sync error:', error.message);
      return null;
    }
  }

  async syncCalendarEvents(userEmail, userId, domain) {
    try {
      const client = await this.getClient();
      if (!client) return null;

      const { data } = await client.get(`/users/${userEmail}/calendar/events`, {
        params: { $top: 20, $orderby: 'start/dateTime desc', $select: 'id,subject,start,end' },
      });

      for (const event of data.value || []) {
        await Activity.create({
          user: userId,
          domain,
          type: 'outlook_calendar',
          source: 'outlook',
          description: `Event: ${event.subject}`,
          metadata: { eventId: event.id, start: event.start?.dateTime, end: event.end?.dateTime },
          score: 4,
        });
      }

      return { events: data.value?.length || 0 };
    } catch (error) {
      console.error('Calendar sync error:', error.message);
      return null;
    }
  }

  async syncTeamsMessages(userId, domain) {
    try {
      const client = await this.getClient();
      if (!client) return null;

      const { data: chats } = await client.get('/me/chats', { params: { $top: 10 } });

      for (const chat of chats.value || []) {
        const { data: messages } = await client.get(`/chats/${chat.id}/messages`, { params: { $top: 10 } });
        for (const msg of messages.value || []) {
          await Activity.create({
            user: userId,
            domain,
            type: 'teams_message',
            source: 'teams',
            description: `Teams message: ${msg.body?.content?.substring(0, 100) || 'No content'}`,
            metadata: { chatId: chat.id, messageId: msg.id },
            score: 3,
          });
        }
      }

      return { chats: chats.value?.length || 0 };
    } catch (error) {
      console.error('Teams sync error:', error.message);
      return null;
    }
  }
  async createChannel(teamId, displayName, description) {
    try {
      const client = await this.getClient();
      if (!client) return { error: 'Microsoft Graph not configured' };
      const { data } = await client.post(`/teams/${teamId}/channels`, {
        displayName,
        description: description || '',
        membershipType: 'standard',
      });
      return { id: data.id, displayName: data.displayName, webUrl: data.webUrl };
    } catch (error) {
      console.error('Teams createChannel error:', error.message);
      return { error: error.response?.data?.error?.message || error.message };
    }
  }

  async getChannel(teamId, channelId) {
    try {
      const client = await this.getClient();
      if (!client) return null;
      const { data } = await client.get(`/teams/${teamId}/channels/${channelId}`);
      return { id: data.id, displayName: data.displayName, webUrl: data.webUrl };
    } catch (error) {
      console.error('Teams getChannel error:', error.message);
      return null;
    }
  }

  async sendChannelMessage(teamId, channelId, message) {
    try {
      const client = await this.getClient();
      if (!client) return null;
      const { data } = await client.post(`/teams/${teamId}/channels/${channelId}/messages`, {
        body: { content: message },
      });
      return { id: data.id };
    } catch (error) {
      console.error('Teams sendMessage error:', error.message);
      return null;
    }
  }

  async sync(platform) {
    try {
      const User = require('../models/User');
      const users = await User.find({ outlookEmail: { $ne: '' }, isActive: true });
      let total = { users: users.length };
      for (const u of users) {
        if (!platform || platform === 'outlook') {
          const emails = await this.syncOutlookEmails(u.outlookEmail, u._id, u.domain);
          const events = await this.syncCalendarEvents(u.outlookEmail, u._id, u.domain);
          if (emails) { total.emails = (total.emails || 0) + emails.emails; }
          if (events) { total.events = (total.events || 0) + events.events; }
        }
        if (!platform || platform === 'teams') {
          const chats = await this.syncTeamsMessages(u._id, u.domain);
          if (chats) { total.chats = (total.chats || 0) + chats.chats; }
        }
      }
      return total;
    } catch (error) {
      console.error('Microsoft Graph auto-sync error:', error.message);
      return null;
    }
  }
}

module.exports = new MicrosoftGraphService();
