/**
 * Seed 3 demo users with Paris-relevant intent graphs for demo day.
 * Run: npx tsx scripts/seed-demo.ts
 */
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const uri = process.env.MONGODB_URI!
const password = 'demo1234'

interface DemoUser {
  handle: string
  name: string
  email: string
  spendingSignal: string
  travelStyle: string
  destinations: Array<{ value: string; weight: number; recencyScore: number; lastSeen: Date }>
  activityPreferences: Record<string, number>
}

const users: DemoUser[] = [
  {
    handle: 'maaz',
    name: 'Maaz',
    email: 'maaz@demo.smartsearch.travel',
    spendingSignal: 'mid-range',
    travelStyle: 'group',
    destinations: [
      { value: 'Paris, France', weight: 0.9, recencyScore: 0.9, lastSeen: new Date() },
      { value: 'Rome, Italy', weight: 0.7, recencyScore: 0.7, lastSeen: new Date() },
      { value: 'Barcelona, Spain', weight: 0.6, recencyScore: 0.6, lastSeen: new Date() },
    ],
    activityPreferences: {
      flights: 0.9, stays: 0.8, cars: 0.6, experiences: 0.85,
      restaurants: 0.9, weather: 0.5, maps: 0.7,
    },
  },
  {
    handle: 'gilson',
    name: 'Gilson',
    email: 'gilson@demo.smartsearch.travel',
    spendingSignal: 'premium',
    travelStyle: 'couple',
    destinations: [
      { value: 'Paris, France', weight: 0.95, recencyScore: 0.95, lastSeen: new Date() },
      { value: "Côte d'Azur, France", weight: 0.8, recencyScore: 0.8, lastSeen: new Date() },
      { value: 'Amsterdam, Netherlands', weight: 0.65, recencyScore: 0.65, lastSeen: new Date() },
    ],
    activityPreferences: {
      flights: 0.95, stays: 0.95, cars: 0.7, experiences: 0.9,
      restaurants: 0.95, weather: 0.4, maps: 0.8,
    },
  },
  {
    handle: 'sam',
    name: 'Sam',
    email: 'sam@demo.smartsearch.travel',
    spendingSignal: 'budget',
    travelStyle: 'group',
    destinations: [
      { value: 'Paris, France', weight: 0.85, recencyScore: 0.85, lastSeen: new Date() },
      { value: 'Prague, Czech Republic', weight: 0.75, recencyScore: 0.75, lastSeen: new Date() },
      { value: 'Lisbon, Portugal', weight: 0.7, recencyScore: 0.7, lastSeen: new Date() },
    ],
    activityPreferences: {
      flights: 0.8, stays: 0.7, cars: 0.5, experiences: 0.9,
      restaurants: 0.8, weather: 0.6, maps: 0.85,
    },
  },
  {
    handle: 'nekha',
    name: 'Nekha',
    email: 'nekha@demo.smartsearch.travel',
    spendingSignal: 'premium',
    travelStyle: 'solo',
    destinations: [
      { value: 'Tokyo, Japan', weight: 0.95, recencyScore: 0.95, lastSeen: new Date() },
      { value: 'Bali, Indonesia', weight: 0.85, recencyScore: 0.85, lastSeen: new Date() },
      { value: 'New York, USA', weight: 0.75, recencyScore: 0.75, lastSeen: new Date() },
    ],
    activityPreferences: {
      flights: 0.9, stays: 0.9, cars: 0.4, experiences: 0.95,
      restaurants: 0.95, weather: 0.5, maps: 0.8,
      health_services: 0.7, appointments: 0.8,
    },
  },
]

async function main() {
  const client = await MongoClient.connect(uri, { maxPoolSize: 5 })
  const db = client.db()

  for (const u of users) {
    const hash = await bcrypt.hash(password, 12)
    const now = new Date()

    const intentGraph = {
      userId: u.handle,
      destinations: u.destinations,
      spendingSignal: u.spendingSignal,
      activityPreferences: u.activityPreferences,
      travelStyle: u.travelStyle,
      seasonalPatterns: [],
      outcomeHistory: [],
      updatedAt: now,
    }

    await db.collection('users').updateOne(
      { handle: u.handle },
      {
        $set: {
          handle: u.handle,
          name: u.name,
          email: u.email,
          passwordHash: hash,
          intentGraph,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    )

    await db.collection('intentGraphs').updateOne(
      { userId: u.handle },
      { $set: intentGraph },
      { upsert: true }
    )

    console.log(`Seeded @${u.handle}`)
  }

  console.log(`\nLogin password for all demo users: ${password}`)
  await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
