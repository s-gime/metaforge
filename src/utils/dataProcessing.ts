import _ from 'lodash';
import traitsJson from '@/mapping/traits.json';
import unitsJson from '@/mapping/units.json';
import itemsJson from '@/mapping/items.json';
import { getIconPath, getTierIcon, ensureIconPath } from '@/utils/paths';
import { ProcessedData, ProcessedMatch, Composition } from '@/types';

// Define additional types for improved type safety
interface ProcessedItem {
  id: string;
  name: string;
  icon: string;
  category?: string;
  stats?: {
    count?: number;
    avgPlacement?: number;
    winRate?: number;
    top4Rate?: number;
  };
}

interface ProcessedUnit {
  id: string;
  name: string;
  icon: string;
  cost: number;
  items?: ProcessedItem[];
  bestItems?: ProcessedItem[];
  stats?: {
    count?: number;
    avgPlacement?: number;
    winRate?: number;
    top4Rate?: number;
  };
}

// Extended types for internal use to avoid type errors
interface ExtendedComposition extends Composition {
  count?: number; // Make count optional to fix the type error
  placement: number; // Add placement property needed for statistics calculations
  region?: string; // Add region as it's used in groupBy
}

// Cached data for better performance
const traits: Record<string, any> = { ...traitsJson.origins, ...traitsJson.classes };
const units: Record<string, any> = unitsJson.units;
const items: Record<string, any> = itemsJson.items;

// Define allowed entity types
type EntityType = 'trait' | 'unit' | 'item';

// Get display name consistently
export const getDisplayName = (id: string, type: EntityType): string => {
  if (type === 'trait') {
    return (traits as Record<string, { name: string }>)[id]?.name || id;
  } else if (type === 'unit') {
    return (units as Record<string, { name: string }>)[id]?.name || id;
  } else if (type === 'item') {
    return (items as Record<string, { name: string }>)[id]?.name || id;
  }
  return id;
};

// Extract main traits from comp name
export const parseCompTraits = (compName: string | undefined, allTraits: any[]): any[] => {
  const mainTraits: any[] = [];
  if (!compName) return allTraits.slice(0, 3);
  
  compName.split(' & ').forEach(part => {
    const match = part.match(/^(\d+)\s+(.+)$/);
    if (match) {
      const [_, count, traitName] = match;
      const matchingTrait = allTraits.find(t => t.name === traitName.trim());
      if (matchingTrait) {
        mainTraits.push(matchingTrait);
      }
    }
  });
  
  return mainTraits.length > 0 ? mainTraits.slice(0, 3) : allTraits.slice(0, 3);
};

// Calculate entity statistics across compositions with improved caps
export const calculateEntityStats = (entities: any[], compositions: ExtendedComposition[]) => {
  // Create an accumulator map for better performance
  const statsMap: Record<string, any> = {};
  
  compositions.forEach(comp => {
    entities.forEach(entity => {
      if (!entity?.id) return;
      
      if (!statsMap[entity.id]) {
        statsMap[entity.id] = {
          ...entity,
          count: 0,
          totalGames: 0,
          winRateSum: 0,
          top4RateSum: 0,
          placementSum: 0
        };
      }
      
      statsMap[entity.id].count++;
      statsMap[entity.id].totalGames += comp.count || 0;
      statsMap[entity.id].placementSum += (comp.avgPlacement || 0) * (comp.count || 1);
      statsMap[entity.id].winRateSum += ((comp.winRate || 0) / 100) * (comp.count || 1);
      statsMap[entity.id].top4RateSum += ((comp.top4Rate || 0) / 100) * (comp.count || 1);
    });
  });
  
  // Convert to array and calculate final stats with caps for reasonable values
  return Object.values(statsMap).map(entity => {
    const totalGames = entity.totalGames || 1;
    const calculatedWinRate = (entity.winRateSum / totalGames) * 100;
    const calculatedTop4Rate = (entity.top4RateSum / totalGames) * 100;
    
    // Cap values to reasonable ranges
    const avgPlacement = Math.min(Math.max(entity.placementSum / totalGames, 1), 8);
    const winRate = Math.min(Math.max(calculatedWinRate, 0), 100);
    const top4Rate = Math.min(Math.max(calculatedTop4Rate, 0), 100);
    
    return {
      ...entity,
      avgPlacement,
      winRate,
      top4Rate,
      playRate: (entity.count / compositions.length) * 100,
      stats: {
        count: entity.count,
        avgPlacement,
        winRate,
        top4Rate
      }
    };
  });
};

// Process match data with optimizations
export const processMatchData = (matches: ProcessedMatch[], region?: string): ProcessedData => {
  if (!matches?.length) {
    return { 
      compositions: [], 
      summary: { totalGames: 0, avgPlacement: 0, topComps: [] },
      region
    };
  }

  // Filter by region if specified
  const filteredMatches = region && region !== 'all' 
    ? matches.filter(m => m.region?.toUpperCase() === region.toUpperCase())
    : matches;

  if (!filteredMatches.length) {
    return { 
      compositions: [], 
      summary: { totalGames: 0, avgPlacement: 0, topComps: [] },
      region 
    };
  }

  // Extract compositions with better map usage - FIXED with required properties
  const compositions = filteredMatches.flatMap(match =>
    match.participants.map(p => {
      // Generate a composition name based on significant traits
      const significantTraits = p.traits
        .filter(t => t.tier_current > 1)
        .sort((a, b) => b.num_units - a.num_units);
      
      // Create a name from the top traits
      const name = significantTraits.length > 0
        ? significantTraits
            .slice(0, 2)
            .map(t => `${t.num_units} ${getDisplayName(t.name, 'trait')}`)
            .join(' & ')
        : 'Mixed Composition';
      
      // Get an icon from the most significant trait
      const primaryTrait = significantTraits[0];
      const icon = primaryTrait
        ? getIconPath((traits)[primaryTrait.name]?.icon || 'default.png', 'trait')
        : '/assets/traits/default.png';
      
      // Generate a unique ID
      const id = `${match.id}-${p.placement}`;
      
      return {
        id,
        name,
        icon,
        placement: p.placement,
        region: match.region || 'unknown',
        traits: p.traits
          .filter(t => t.tier_current >= 1)
          .map(t => ({
            id: t.name,
            name: getDisplayName(t.name, 'trait'),
            icon: getIconPath((traits)[t.name]?.icon || 'default.png', 'trait'),
            tier: t.tier_current,
            numUnits: t.num_units,
            tierIcon: getTierIcon(t.name, t.num_units)
          }))
          .sort((a, b) => b.tier !== a.tier ? b.tier - a.tier : a.name.localeCompare(b.name)),
        units: p.units.map(u => {
          // Get the unit data from mapping
          const unitData = (units)[u.name];
          
          return {
            id: u.name,
            name: getDisplayName(u.name, 'unit'),
            icon: getIconPath(unitData?.icon || 'default.png', 'unit'),
            cost: unitData?.cost || 0,
            // Include traits data directly from unit mapping - CRITICAL FIX
            traits: unitData?.traits || {},
            items: u.itemNames.map(item => ({
              id: item,
              name: getDisplayName(item, 'item'),
              icon: getIconPath((items)[item]?.icon || 'default.png', 'item'),
              category: (items)[item]?.category
            }))
          };
        })
      };
    })
  ) as ExtendedComposition[];  // Use our extended type with explicit casting

  // Process best items per unit - IMPROVED CALCULATION
  const itemsByUnit: Record<string, Record<string, {
    item: ProcessedItem, 
    count: number, 
    winRateSum: number, 
    top4RateSum: number,
    placementSum: number,
    totalGames: number
  }>> = {};
  
  compositions.forEach((comp: ExtendedComposition) => {
    comp.units.forEach(unit => {
      if (!itemsByUnit[unit.id]) itemsByUnit[unit.id] = {};
      
      (unit.items || []).forEach(item => {
        if (!itemsByUnit[unit.id][item.id]) {
          itemsByUnit[unit.id][item.id] = { 
            item, 
            count: 0,
            winRateSum: 0,
            top4RateSum: 0,
            placementSum: 0,
            totalGames: 0
          };
        }
        itemsByUnit[unit.id][item.id].count++;
        itemsByUnit[unit.id][item.id].totalGames += comp.count || 1;
        itemsByUnit[unit.id][item.id].placementSum += (comp.avgPlacement || 0) * (comp.count || 1);
        itemsByUnit[unit.id][item.id].winRateSum += ((comp.winRate || 0) / 100) * (comp.count || 1);
        itemsByUnit[unit.id][item.id].top4RateSum += ((comp.top4Rate || 0) / 100) * (comp.count || 1);
      });
    });
  });
  
  // Add best items to units with properly capped stats
  Object.entries(itemsByUnit).forEach(([unitId, unitItems]) => {
    const bestItems = Object.values(unitItems)
      .map(entry => {
        const totalGames = entry.totalGames || 1;
        const winRate = Math.min((entry.winRateSum / totalGames) * 100, 100);
        const top4Rate = Math.min((entry.top4RateSum / totalGames) * 100, 100);
        const avgPlacement = Math.min(Math.max(entry.placementSum / totalGames, 1), 8);
        
        return {
          ...entry.item,
          stats: {
            count: entry.count,
            winRate,
            top4Rate,
            avgPlacement
          }
        };
      })
      .sort((a, b) => (b.stats?.winRate || 0) - (a.stats?.winRate || 0))
      .slice(0, 3);
      
    compositions.forEach(comp => {
      comp.units.forEach(unit => {
        if (unit.id === unitId) (unit as ProcessedUnit).bestItems = bestItems;
      });
    });
  });

  // Calculate unit-item relationships for item detail page
  const unitsWithItems: Record<string, Record<string, {
    unit: ProcessedUnit,
    count: number,
    winRateSum: number,
    top4RateSum: number,
    placementSum: number,
    totalGames: number,
    relatedComps: Set<string>
  }>> = {};
  
  // First pass - gather data
  compositions.forEach((comp: ExtendedComposition) => {
    comp.units.forEach(unit => {
      (unit.items || []).forEach(item => {
        if (!unitsWithItems[item.id]) unitsWithItems[item.id] = {};
        
        if (!unitsWithItems[item.id][unit.id]) {
          unitsWithItems[item.id][unit.id] = {
            unit: { ...unit },
            count: 0,
            winRateSum: 0,
            top4RateSum: 0,
            placementSum: 0,
            totalGames: 0,
            relatedComps: new Set()
          };
        }
        
        unitsWithItems[item.id][unit.id].count++;
        unitsWithItems[item.id][unit.id].totalGames += comp.count || 1;
        unitsWithItems[item.id][unit.id].placementSum += (comp.avgPlacement || 0) * (comp.count || 1);
        unitsWithItems[item.id][unit.id].winRateSum += ((comp.winRate || 0) / 100) * (comp.count || 1);
        unitsWithItems[item.id][unit.id].top4RateSum += ((comp.top4Rate || 0) / 100) * (comp.count || 1);
        unitsWithItems[item.id][unit.id].relatedComps.add(comp.id);
      });
    });
  });

  // Improved composition grouping
  const compsByKey = _.groupBy(compositions, comp => {
    // Only consider traits with tier > 1 for composition name
    const significantTraits = comp.traits
      .filter(t => t.tier > 1 && t.numUnits > 1)
      .sort((a, b) => b.numUnits - a.numUnits || a.name.localeCompare(b.name))
      .slice(0, 2);
      
    const key = significantTraits
      .map(t => `${t.numUnits} ${t.name}`)
      .join(' & ');
      
    return key || 'Other';
  });
  
  // Create composition stats
  const stats: Composition[] = Object.entries(compsByKey)
    .filter(([name]) => name !== 'Other')
    .map(([name, comps]) => {
      // Get traits for icon determination - FIXED ICON SELECTION
      // Filter traits to only include those with tier > 1
      const traits = _.uniqBy(comps.flatMap(c => c.traits), 'id')
        .sort((a, b) => b.tier - a.tier);
      
      // Find significant traits (tier > 1) for the icon
      const significantTraits = traits.filter(t => t.tier > 1);
      
      // Calculate placement data for distribution charts
      const placementData = _.chain(comps)
        .countBy('placement')
        .map((count, place) => ({ placement: Number(place), count }))
        .sortBy('placement')
        .value();
      
      const avgPlacement = _.meanBy(comps, 'placement');
      const winRate = Math.min((comps.filter(c => c.placement === 1).length / comps.length) * 100, 100);
      const top4Rate = Math.min((comps.filter(c => c.placement <= 4).length / comps.length) * 100, 100);
      
      return {
        id: name.replace(/\s+/g, '-').toLowerCase(),
        name,
        // Set icon to first significant trait with tier > 1, fallback to first trait if none
        icon: significantTraits.length > 0 
          ? (significantTraits[0].tierIcon || significantTraits[0].icon) 
          : (traits.length > 0 ? (traits[0].tierIcon || traits[0].icon) : ''),
        traits,
        units: _.chain(comps)
          .flatMap('units')
          .groupBy('id')
          .map((units) => ({
            ...units[0],
            count: units.length
          }))
          .orderBy(['count', 'cost'], ['desc', 'desc'])
          .value(),
        count: comps.length,
        avgPlacement,
        winRate,
        top4Rate,
        playRate: (comps.length / compositions.length) * 100,
        placementData,
        // Store region data
        regions: _.countBy(comps, 'region'),
        stats: {
          count: comps.length,
          avgPlacement,
          winRate,
          top4Rate
        }
      };
    })
    .filter(comp => comp.count >= 2)
    .sort((a, b) => b.count - a.count);

  // Second pass - add unitsWithItem to each item
  stats.forEach(comp => {
    comp.units.forEach(unit => {
      (unit.items || []).forEach(item => {
        if (!item.id) return;
        
        const itemId = item.id;
        
        // Add related comps to unitsWithItem
        if (unitsWithItems[itemId] && unitsWithItems[itemId][unit.id]) {
          unitsWithItems[itemId][unit.id].relatedComps.add(comp.id);
        }
      });
    });
  });
  
  // Process units with items - add to compositions
  Object.entries(unitsWithItems).forEach(([itemId, unitEntries]) => {
    const processedUnits = Object.values(unitEntries).map(entry => {
      const totalGames = entry.totalGames || 1;
      const winRate = Math.min((entry.winRateSum / totalGames) * 100, 100);
      const top4Rate = Math.min((entry.top4RateSum / totalGames) * 100, 100);
      const avgPlacement = Math.min(Math.max(entry.placementSum / totalGames, 1), 8);
      
      return {
        ...entry.unit,
        count: entry.count,
        winRate,
        top4Rate,
        avgPlacement,
        relatedComps: Array.from(entry.relatedComps)
          .map(compId => stats.find(s => s.id === compId))
          .filter((comp): comp is Composition => comp !== undefined)
      };
    })
    .sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
    
    // Add units with item to all comps that have this item
    stats.forEach(comp => {
      const hasItem = comp.units.some(unit => 
        (unit.items || []).some(item => item.id === itemId)
      );
      
      if (hasItem) {
        const itemsInComp = _.flatMap(comp.units, u => u.items || [])
          .find(item => item.id === itemId);
          
        if (itemsInComp) {
          // Add unitsWithItem property
          itemsInComp.unitsWithItem = processedUnits;
        }
      }
    });
  });

  return {
    compositions: stats,
    summary: {
      totalGames: filteredMatches.length,
      avgPlacement: _.meanBy(compositions, 'placement'),
      topComps: stats.slice(0, 5)
    },
    region
  };
};
