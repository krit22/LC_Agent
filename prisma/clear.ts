import 'dotenv/config'
import { prisma } from '../src/db/prisma.js'

async function clear() {
  console.log('🧹 Clearing all data from tables...')

  // Delete in order of foreign key dependencies
  await prisma.task.deleteMany({})
  console.log('  ✓ Cleared tasks')

  await prisma.personDomain.deleteMany({})
  console.log('  ✓ Cleared person_domains')

  await prisma.person.deleteMany({})
  console.log('  ✓ Cleared people')

  await prisma.messageAuditLog.deleteMany({})
  console.log('  ✓ Cleared message_audit_logs')

  await prisma.domain.deleteMany({})
  console.log('  ✓ Cleared domains')

  console.log('✨ All tables have been completely cleared and reset.')
}

clear()
  .catch((e) => {
    console.error('❌ Failed to clear database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
