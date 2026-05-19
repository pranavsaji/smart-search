/**
 * Seed the provider directory with demo data for Phase 3.
 * Run: npx tsx scripts/seed-providers.ts
 *
 * Idempotent: drops and re-inserts all demo providers on each run.
 * Replace schedulingUrl values with real Calendly links to enable Genie booking.
 */

import 'dotenv/config'
import { MongoClient } from 'mongodb'
import type { ServiceProvider } from '../lib/services/provider-directory/types'

const MONGO_URI = process.env.MONGODB_URI
if (!MONGO_URI) throw new Error('MONGODB_URI not set')

const UPCOMING_SLOTS = ['Today 2pm', 'Today 4pm', 'Tomorrow 9am', 'Tomorrow 11am', 'Tomorrow 3pm']
const HEALTH_SLOTS   = ['Today 9am', 'Today 2pm', 'Tomorrow 8:30am', 'Tomorrow 11am', 'Tomorrow 3pm']
const now = new Date()

const PROVIDERS: Omit<ServiceProvider, '_id'>[] = [
  // ── Home Services ──────────────────────────────────────────────────────────
  {
    name: 'Swift Plumbing & Heating',
    category: 'plumber',
    serviceType: 'home_services',
    location: 'London',
    platform: 'Checkatrade',
    description: 'Gas Safe registered · Emergency callouts · Boiler installs & repairs · 15-year experience',
    imageUrl: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400',
    rating: 4.9, reviewCount: 1243,
    priceAmount: 9900, priceCurrency: 'GBP', priceDisplay: '£99 call-out',
    schedulingUrl: 'https://calendly.com/swift-plumbing/callout',
    deepLinkUrl: 'https://www.checkatrade.com/search?trade=plumber',
    metadata: { category: 'plumber', platform: 'Checkatrade', specialty: 'Gas Safe, emergency' },
    availability: UPCOMING_SLOTS.slice(0, 3), responseTime: 'Within 1 hour', insurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'London Electrical Solutions',
    category: 'electrician',
    serviceType: 'home_services',
    location: 'London',
    platform: 'Checkatrade',
    description: 'NICEIC certified · Part P approved · Consumer units, EV chargers, solar installations',
    imageUrl: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400',
    rating: 4.8, reviewCount: 892,
    priceAmount: 8500, priceCurrency: 'GBP', priceDisplay: '£85 call-out',
    schedulingUrl: 'https://calendly.com/london-electrical/callout',
    deepLinkUrl: 'https://www.checkatrade.com/search?trade=electrician',
    metadata: { category: 'electrician', platform: 'Checkatrade', specialty: 'EV chargers, solar' },
    availability: UPCOMING_SLOTS, responseTime: 'Within 2 hours', insurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Spotless Home Cleaning',
    category: 'cleaner',
    serviceType: 'home_services',
    platform: 'Bark',
    description: 'Regular, deep-clean, end-of-tenancy · Eco-friendly products · Fully insured · DBS checked',
    imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400',
    rating: 4.8, reviewCount: 3104,
    priceAmount: 2500, priceCurrency: 'GBP', priceDisplay: '£25 / hr',
    schedulingUrl: 'https://calendly.com/spotless-cleaning/booking',
    deepLinkUrl: 'https://www.bark.com/en/gb/domestic-cleaning/',
    metadata: { category: 'cleaner', platform: 'Bark', specialty: 'Eco-friendly, end-of-tenancy' },
    availability: UPCOMING_SLOTS, responseTime: 'Within 4 hours', insurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Pro Handyman Services',
    category: 'handyman',
    serviceType: 'home_services',
    platform: 'TaskRabbit',
    description: 'Furniture assembly, TV mounting, shelving, minor repairs · Background checked · Fixed pricing',
    imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400',
    rating: 4.7, reviewCount: 4820,
    priceAmount: 4500, priceCurrency: 'GBP', priceDisplay: '£45 / hr',
    schedulingUrl: 'https://calendly.com/pro-handyman/booking',
    deepLinkUrl: 'https://www.taskrabbit.co.uk',
    metadata: { category: 'handyman', platform: 'TaskRabbit', specialty: 'Assembly, mounting' },
    availability: UPCOMING_SLOTS, responseTime: 'Within 2 hours', insurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'City Mobile Mechanics',
    category: 'mechanic',
    serviceType: 'home_services',
    platform: 'YourMechanic',
    description: 'Mobile auto repair · MOT prep · Oil changes, brakes, diagnostics · Comes to you · Fixed quotes',
    imageUrl: 'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=400',
    rating: 4.9, reviewCount: 2130,
    priceAmount: 8500, priceCurrency: 'GBP', priceDisplay: '£85 / hr',
    schedulingUrl: 'https://calendly.com/city-mobile-mechanics/booking',
    deepLinkUrl: 'https://www.yourmechanic.com',
    metadata: { category: 'mechanic', platform: 'YourMechanic', specialty: 'Mobile, MOT prep' },
    availability: UPCOMING_SLOTS, responseTime: 'Within 2 hours', insurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },

  // ── Health Services ────────────────────────────────────────────────────────
  {
    name: 'Dr Sarah Chen — GP',
    category: 'gp',
    serviceType: 'health_services',
    location: 'London',
    platform: 'Babylon Health',
    description: 'Private GP · Video & in-person · Same-day available · Prescriptions · NHS referrals',
    imageUrl: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=400',
    rating: 4.9, reviewCount: 1842,
    priceAmount: 4900, priceCurrency: 'GBP', priceDisplay: '£49 / consultation',
    schedulingUrl: 'https://calendly.com/dr-sarah-chen/gp-appointment',
    deepLinkUrl: 'https://www.babylonhealth.com',
    metadata: { specialty: 'GP', platform: 'Babylon Health' },
    availability: HEALTH_SLOTS.slice(0, 4), teleconsult: true, acceptsInsurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Bright Smile Dental Practice',
    category: 'dentist',
    serviceType: 'health_services',
    location: 'London',
    platform: 'mydentist',
    description: 'NHS & private · Check-ups, hygienist, whitening · Invisalign · Emergency appointments',
    imageUrl: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400',
    rating: 4.8, reviewCount: 2413,
    priceAmount: 2570, priceCurrency: 'GBP', priceDisplay: 'From £25.70 (NHS)',
    schedulingUrl: 'https://calendly.com/bright-smile-dental/appointment',
    deepLinkUrl: 'https://www.mydentist.co.uk/find-a-dentist',
    metadata: { specialty: 'Dentist', platform: 'mydentist' },
    availability: HEALTH_SLOTS.slice(2, 6), teleconsult: false, acceptsInsurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Mind & Wellbeing Therapy',
    category: 'therapist',
    serviceType: 'health_services',
    platform: 'BetterHelp',
    description: 'BACP accredited · CBT, EMDR, psychodynamic · Video, phone, or text · Cancel anytime',
    imageUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400',
    rating: 4.9, reviewCount: 8320,
    priceAmount: 6500, priceCurrency: 'GBP', priceDisplay: '£65 / session',
    schedulingUrl: 'https://calendly.com/mind-wellbeing-therapy/session',
    deepLinkUrl: 'https://www.betterhelp.com',
    metadata: { specialty: 'Therapist', platform: 'BetterHelp' },
    availability: HEALTH_SLOTS, teleconsult: true, acceptsInsurance: false,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Active Recovery Physiotherapy',
    category: 'physio',
    serviceType: 'health_services',
    location: 'London',
    platform: 'Physitrack',
    description: 'MSc Physiotherapist · Sports injuries, back pain, post-surgery · Home visits available',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400',
    rating: 4.9, reviewCount: 941,
    priceAmount: 7000, priceCurrency: 'GBP', priceDisplay: '£70 / session',
    schedulingUrl: 'https://calendly.com/active-recovery-physio/session',
    deepLinkUrl: 'https://www.zocdoc.com/search?reason=Physical+Therapist',
    metadata: { specialty: 'Physiotherapist', platform: 'Physitrack' },
    availability: HEALTH_SLOTS.slice(1, 5), teleconsult: false, acceptsInsurance: true,
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },

  // ── Digital Services ───────────────────────────────────────────────────────
  {
    name: 'Alex Mercer — Full-Stack Engineer',
    category: 'developer',
    serviceType: 'digital_services',
    platform: 'Upwork',
    description: 'Next.js, Node.js, Postgres · 5-star rated · 98% job success · 10yr experience · Sprint-based',
    imageUrl: 'https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?w=400',
    rating: 4.9, reviewCount: 214,
    priceAmount: 9000, priceCurrency: 'GBP', priceDisplay: '£90 / hr',
    schedulingUrl: 'https://calendly.com/alex-mercer-dev/discovery-call',
    deepLinkUrl: 'https://www.upwork.com/freelance-jobs/react/',
    metadata: { platform: 'Upwork', category: 'developer' },
    deliveryDays: 3, level: 'expert',
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'Priya Sharma — Brand Designer',
    category: 'designer',
    serviceType: 'digital_services',
    platform: '99designs',
    description: 'Full brand identity · Figma · Logo, design systems, Webflow builds · Award-winning portfolio',
    imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400',
    rating: 4.9, reviewCount: 183,
    priceAmount: 12000, priceCurrency: 'GBP', priceDisplay: '£120 / hr',
    schedulingUrl: 'https://calendly.com/priya-sharma-design/intro',
    deepLinkUrl: 'https://99designs.co.uk/logo-design',
    metadata: { platform: '99designs', category: 'designer' },
    deliveryDays: 7, level: 'expert',
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
  {
    name: 'James Holden — SEO Copywriter',
    category: 'copywriter',
    serviceType: 'digital_services',
    platform: 'Upwork',
    description: 'SEO-optimised content · SaaS & tech specialist · Long-form, email, landing pages · 48h turnaround',
    imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400',
    rating: 4.8, reviewCount: 327,
    priceAmount: 8000, priceCurrency: 'GBP', priceDisplay: '£80 / hr',
    schedulingUrl: 'https://calendly.com/james-holden-copy/brief-call',
    deepLinkUrl: 'https://www.upwork.com/freelance-jobs/content-writing/',
    metadata: { platform: 'Upwork', category: 'copywriter' },
    deliveryDays: 2, level: 'expert',
    supportsGenie: true, isActive: true, createdAt: now, updatedAt: now,
  },
]

async function seedProviders(): Promise<void> {
  const client = await MongoClient.connect(MONGO_URI!)
  const db = client.db()
  const col = db.collection('providers')

  await col.deleteMany({ isActive: { $exists: true } }) // clear demo providers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await col.insertMany(PROVIDERS as any[])
  console.log(`Inserted ${result.insertedCount} providers`)

  await col.createIndexes([
    { key: { serviceType: 1, category: 1, isActive: 1 } },
    { key: { serviceType: 1, location: 1, isActive: 1 } },
  ])
  console.log('Indexes created')

  await client.close()
}

seedProviders().catch((err) => {
  console.error(err)
  process.exit(1)
})
