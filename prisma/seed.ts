import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const INITIAL_DOMAINS = [
  {
    name: 'Web Development',
    code: 'web_dev',
    description: 'Web development, club portals, bot infrastructure, and tech maintenance.',
  },
  {
    name: 'Video Editing',
    code: 'video_editing',
    description: 'Video production, reels, promotional clips, and event coverage edits.',
  },
  {
    name: 'Content Writing',
    code: 'content_writing',
    description: 'Literary content, newsletters, captions, articles, and event scripts.',
  },
  {
    name: 'Graphic Designing',
    code: 'graphic_design',
    description: 'Posters, social media creatives, banners, brochures, and visual branding.',
  },
]

async function main() {
  console.log('🌱 Starting database seed...')

  for (const domain of INITIAL_DOMAINS) {
    const upserted = await prisma.domain.upsert({
      where: { code: domain.code },
      update: {
        name: domain.name,
        description: domain.description,
      },
      create: {
        name: domain.name,
        code: domain.code,
        description: domain.description,
      },
    })
    console.log(`  ✓ Domain ready: ${upserted.name} (${upserted.code})`)
  }

  console.log('✅ Database seed completed successfully.')
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
