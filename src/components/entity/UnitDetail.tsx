import React, { useState } from 'react';
import Link from 'next/link';
import { UnitIcon, ItemIcon, StatsPanel, TraitIcon, PlacementDistribution } from '@/components/ui';
import traitsJson from '@/mapping/traits.json';
import { Heart, Droplet, Shield, Shell, Sword, Zap, Gauge, FastForward, ArrowLeftRight } from 'lucide-react';
import { ProcessedUnit } from '@/types';
import { getIconPath, getEntityIcon, DEFAULT_ICONS, getUnitTraits, getTraitInfo } from '@/utils/paths';

export default function UnitDetail({ 
  entityData, 
  unitDetails 
}: { 
  entityData: ProcessedUnit | null, 
  unitDetails: any 
}) {
  const [starLevel, setStarLevel] = useState<number>(1);
  
  const statIconComponents = {
    health: Heart,
    mana: Droplet,
    armor: Shield,
    mr: Shell,
    damage: Sword, 
    attack_speed: FastForward,
    crit_rate: Gauge,
    range: ArrowLeftRight,
    dps: Zap
  };

  if (!entityData) return null;

  // Calculate scaled stats based on star level
  const getScaledStat = (statKey: string, baseStat: number): number => {
    if (!baseStat) return 0;
    
    const scalingFactors = {
        health: [1, 1.8, 3.24, 5.832], // Corrected 4-star value
        armor: [1, 1.5, 2.25, 3.375], // Updated to match damage scaling
        mr: [1, 1.5, 2.25, 3.375], // Updated to match damage scaling
        damage: [1, 1.5, 2.25, 3.375], // Corrected scaling for damage
        dps: [1, 1.5, 2.25, 3.375] // Updated to match damage scaling
    };
    
    const factor = scalingFactors[statKey as keyof typeof scalingFactors]?.[starLevel - 1] || 1;
    const scaledValue = Math.round(baseStat * factor * 10) / 10;
    
    // Cap extremely high values that could be calculation errors
    const cap = statKey === 'health' ? 10000 : 
               (statKey === 'attack_speed' ? 5.0 : 
               (statKey.includes('rate') ? 100 : 1000));
               
    return Math.min(scaledValue, cap);
  };

  // Star button component
  const StarButton = ({ level, isActive, onClick }: { level: number, isActive: boolean, onClick: () => void }) => {
    const starColors = {
      1: "text-amber-700",
      2: "text-gray-400",
      3: "text-amber-400",
      4: "text-emerald-400"
    };
    
    const starText = {
      1: "★",
      2: "★★",
      3: "★★★",
      4: "★★★★"
    };
    
    return (
      <button
        onClick={onClick}
        className={`px-1.5 py-0.5 rounded transition-all ${
          isActive 
            ? `${starColors[level as keyof typeof starColors]} bg-brown-light/50` 
            : 'text-cream/40 hover:text-cream/60'
        }`}
        style={{ letterSpacing: "-1px" }}
      >
        {starText[level as keyof typeof starText]}
      </button>
    );
  };

  // Get unit traits - CRITICAL FIX: properly get traits
  const unitTraitsList = getUnitTraits(unitDetails);
  
  // Prepare placement data for distribution chart
  const placementData = entityData.relatedComps ? 
    entityData.relatedComps.reduce((acc, comp) => {
      if (!comp.placementData) return acc;
      
      // Aggregate placement data from all related compositions
      comp.placementData.forEach(pd => {
        const existing = acc.find(a => a.placement === pd.placement);
        if (existing) {
          existing.count += pd.count;
        } else {
          acc.push({ ...pd });
        }
      });
      return acc;
    }, [] as Array<{ placement: number; count: number }>) : 
    undefined;

  return (
    <>
      <div className="flex items-center gap-4 border-b border-gold/30 pb-4 mb-4">
        <UnitIcon unit={entityData} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-gold">{entityData.name}</h1>
          <p className="text-sm text-cream/80">{entityData.cost} 🪙</p>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-brown-light/20 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gold mb-4">Traits</h2>
            <div className="flex flex-wrap gap-2">
              {unitTraitsList.map((traitEntry, i) => {
                // Get full trait info
                const traitInfo = getTraitInfo(traitEntry.id);
                if (!traitInfo) return null;
                
                return (
                  <Link href={`/entity/traits/${traitEntry.id}`} key={i}>
                    <div className="flex items-center gap-2 bg-brown-light/30 rounded p-2 hover:bg-brown-light/40">
                      <TraitIcon 
                        trait={{
                          id: traitEntry.id,
                          name: traitInfo.name,
                          icon: traitInfo.icon
                        }}
                        size="sm"
                      />
                      <span>{traitInfo.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="bg-brown-light/20 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gold mb-3">Ability</h2>
            {unitDetails?.ability && (
              <div className="bg-brown-light/30 p-3 rounded">
                <h3 className="text-md font-semibold text-gold border-b border-gold/30 pb-2 mb-2">
                  {unitDetails.ability.name}
                </h3>
                <p className="text-sm">{unitDetails.ability.description}</p>
              </div>
            )}
          </div>
          
          <div className="bg-brown-light/20 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gold mb-4">Performance Stats</h2>
            <StatsPanel stats={{
              ...entityData.stats,
              placementData // Added placement data for distribution chart
            }} />
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-brown-light/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gold">Stats</h2>
              <div className="flex space-x-1">
                {[1, 2, 3, 4].map(level => (
                  <StarButton 
                    key={level}
                    level={level}
                    isActive={starLevel === level}
                    onClick={() => setStarLevel(level)}
                  />
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {unitDetails?.stats && Object.entries(unitDetails.stats).map(([key, value], i) => {
                const statName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const scaledValue = getScaledStat(key, value as number);
                
                return (
                  <div key={i} className="flex items-center gap-2 bg-brown-light/30 px-3 py-2 rounded">
                    {statIconComponents[key as keyof typeof statIconComponents] && React.createElement(statIconComponents[key as keyof typeof statIconComponents], {
                      size: 16,
                      className: "text-gold",
                      strokeWidth: 2
                    })}
                    <div className="text-xs flex-grow">{statName}</div>
                    <div className="font-semibold text-gold-light">{scaledValue}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {entityData.bestItems && entityData.bestItems.length > 0 && (
            <div className="bg-brown-light/20 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gold mb-4">Best Items</h2>
              <div className="grid grid-cols-3 gap-3">
                {entityData.bestItems.map((item, i) => (
                  <Link href={`/entity/items/${item.id}`} key={i}>
                    <div className="flex flex-col items-center gap-2 bg-brown-light/30 p-3 rounded hover:bg-brown-light/40">
                      <ItemIcon item={item} size="md" />
                      <div className="text-center">
                        <div className="text-sm font-medium truncate max-w-28">{item.name}</div>
                        <div className="text-xs text-gold-light">
                          Win: {Math.min(item.stats?.winRate || 0, 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {entityData.relatedComps && entityData.relatedComps.length > 0 && (
            <div className="bg-brown-light/20 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gold mb-4">Top Compositions</h2>
              <div className="grid grid-cols-2 gap-3">
                {entityData.relatedComps.slice(0, 4).map((comp, i) => (
                  <Link href={`/entity/comps/${comp.id}`} key={i}>
                    <div className="bg-brown-light/30 p-3 rounded hover:bg-brown-light/40">
                      <div className="flex justify-center gap-1 mb-2">
                        {(comp.traits || []).slice(0, 3).map((trait, j) => (
                          <TraitIcon
                            key={j}
                            trait={trait}
                            size="sm"
                          />
                        ))}
                      </div>
                      <div className="text-sm font-medium text-center truncate">{comp.name?.split('&')[0] || 'Comp'}</div>
                      <div className="text-xs text-center mt-2">
                        <span className="mr-2">Win: {Math.min(comp.winRate || 0, 100).toFixed(1)}%</span>
                        <span>Avg: {comp.avgPlacement?.toFixed(2)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
