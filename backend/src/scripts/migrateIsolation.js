const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cios');
  const User = require('../models/User');
  const Project = require('../models/Project');
  const Company = require('../models/Company');

  const users = await User.find({});
  let updated = 0;

  for (const user of users) {
    const bareDomain = user.email.split('@')[1]?.toLowerCase() || user.email.toLowerCase();
    if (user.domain === bareDomain) {
      continue;
    }

    const existing = await Company.findOne({ domain: bareDomain });
    if (!existing) {
      await Company.create({
        name: user.name + "'s Company",
        domain: bareDomain,
        plan: 'starter',
        createdBy: user._id,
      });
    }

    await User.updateOne({ _id: user._id }, { $set: { domain: bareDomain } });

    await Project.updateMany(
      { members: user._id },
      { $set: { domain: bareDomain } }
    );

    updated++;
    console.log(`  ${user.email}: domain → ${bareDomain}`);
  }

  console.log(`\nMigrated ${updated} users to per-domain isolation`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
