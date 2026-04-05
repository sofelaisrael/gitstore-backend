import app from './api/index.js';
import supertest from 'supertest';
import dotenv from 'dotenv';

dotenv.config();
const request = supertest(app);
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function runVerification() {
  console.log('--- OPENHUB STORE BACKEND VERIFICATION ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('------------------------------------------\n');

  try {
    // 1. Test Search Endpoint (Cache Miss / Live GitHub)
    console.log('[1/4] Testing /api/search with query "obs-studio"...');
    const searchRes = await request.get('/api/search?q=obs-studio');
    console.log('Status:', searchRes.status);
    if (searchRes.status === 200) {
      console.log('Found:', searchRes.body.repos?.length, 'repositories');
      if (searchRes.body.repos?.[0]) {
        console.log('First Repo Sample (Contract Check):', {
          id: typeof searchRes.body.repos[0].id,
          fullName: searchRes.body.repos[0].fullName,
          stars: typeof searchRes.body.repos[0].stars,
          iconUrl: !!searchRes.body.repos[0].iconUrl
        });
      }
    } else {
      console.error('Search failed:', searchRes.body);
    }
    console.log('------------------------------------------\n');

    // 2. Test Store Featured Endpoint
    console.log('[2/4] Testing /api/store/featured...');
    const featuredRes = await request.get('/api/store/featured');
    console.log('Status:', featuredRes.status);
    if (featuredRes.status === 200) {
      console.log('Featured App:', featuredRes.body.featured ? featuredRes.body.featured.name : 'None (Correct for empty DB)');
      console.log('Trending Count:', featuredRes.body.trending?.length);
      console.log('Recent Count:', featuredRes.body.recent?.length);
      console.log('Stats:', featuredRes.body.stats);
    }
    console.log('------------------------------------------\n');

    // 3. Test Admin Protected Route
    console.log('[3/4] Testing /api/admin/indexed-count with secret...');
    const adminRes = await request.get('/api/admin/indexed-count')
      .set('X-Admin-Secret', ADMIN_SECRET);
    console.log('Status:', adminRes.status);
    console.log('Body:', adminRes.body);
    console.log('------------------------------------------\n');

    // 4. Test Public Statistics
    console.log('[4/4] Testing /api/store/stats...');
    const statsRes = await request.get('/api/store/stats');
    console.log('Status:', statsRes.status);
    console.log('Body:', statsRes.body);
    console.log('------------------------------------------\n');

    console.log('Verification Complete.');
  } catch (error) {
    console.error('Verification script crashed:', error);
    process.exit(1);
  }
}

runVerification();
