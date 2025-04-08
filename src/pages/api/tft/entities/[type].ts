import type { NextApiRequest, NextApiResponse } from 'next';
import { initializeDatabase, getProcessedStats, insertSampleData } from '@/utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Initialize database if needed
    await initializeDatabase();
    
    const { type, region = 'all' } = req.query;
    
    // Validate type
    const validTypes = ['units', 'items', 'traits', 'comps'];
    if (!type || !validTypes.includes(type as string)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }
    
    // Get the cached processed data
    const processedData = await getProcessedStats(type as string, region as string);
    
    if (processedData) {
      // Set cache headers
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).json(processedData);
    }
    
    // No data - insert sample data
    console.log(`No ${type} data available, inserting sample data`);
    await insertSampleData();
    
    // Get the sample data we just inserted
    const sampleData = await getProcessedStats(type as string, region as string);
    
    if (sampleData) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).json(sampleData);
    }
    
    return res.status(404).json({ error: `No ${type} data available and failed to create sample data` });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
