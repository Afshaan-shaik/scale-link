import React, { useState, useEffect } from 'react';

interface RequestPathStripProps {
  lastEvent?: {
    code: string;
    cache: 'HIT' | 'MISS' | 'NONE';
    servedBy: 'redis' | 'db';
    latencyMs: number;
    timestamp: string;
  };
}

export const RequestPathStrip: React.FC<RequestPathStripProps> = ({ lastEvent }) => {
  const [activeStep, setActiveStep] = useState<number>(5); // All lit initially
  const [isSimulating, setIsSimulating] = useState(false);
  const [isMissSimulation, setIsMissSimulation] = useState(false);
  const [simulatedPath, setSimulatedPath] = useState<{
    cache: 'HIT' | 'MISS';
    latency: number;
    servedBy: 'redis' | 'db';
    code: string;
  }>({
    cache: lastEvent?.cache === 'MISS' ? 'MISS' : 'HIT',
    latency: lastEvent?.latencyMs || 1.8,
    servedBy: lastEvent?.servedBy || 'redis',
    code: lastEvent?.code || 'gh-repo',
  });

  // Keep code in sync if lastEvent changes
  useEffect(() => {
    if (lastEvent?.code) {
      setSimulatedPath(prev => ({
        ...prev,
        code: lastEvent.code,
        latency: lastEvent.latencyMs || prev.latency,
      }));
    }
  }, [lastEvent]);

  const triggerSimulation = (type: 'HIT' | 'MISS') => {
    if (isSimulating) return;
    setIsSimulating(true);
    setIsMissSimulation(type === 'MISS');
    setActiveStep(-1);

    const isHit = type === 'HIT';
    setSimulatedPath({
      cache: type,
      latency: isHit ? 1.8 : 14.6,
      servedBy: isHit ? 'redis' : 'db',
      code: lastEvent?.code || 'gh-repo',
    });

    // Light the steps one by one every ~320ms
    const totalSteps = 6;
    for (let i = 0; i < totalSteps; i++) {
      setTimeout(() => {
        setActiveStep(i);
        if (i === totalSteps - 1) {
          setIsSimulating(false);
        }
      }, i * 320);
    }
  };

  const isHit = simulatedPath.cache === 'HIT';

  return (
    <div className="luxe-hero">
      {/* Header with Title and Simulation Controls */}
      <div className="flex flex-wrap gap-[28px] justify-between items-start">
        <div>
          <h2 className="text-white flex items-center flex-wrap">
            Real-time request pipeline &amp; cache-aside strip
            <span className="font-mono text-[11px] text-[var(--em)] border border-[#34d6a066] rounded-full px-3 py-[3px] ml-3 align-middle tracking-widest font-medium">
              LIVE FLOW
            </span>
          </h2>
          <p className="text-[var(--mut)] text-[14px] mt-[10px] max-w-[56ch]">
            Observing incoming GET /{simulatedPath.code} redirects traversing Nginx, Redis Token Bucket, Cache-Aside, and Streams.
          </p>
        </div>

        {/* Simulator Buttons */}
        <div className="flex gap-[14px] flex-wrap items-center">
          <button 
            onClick={() => triggerSimulation('HIT')}
            disabled={isSimulating}
            className="luxe-btn text-[var(--em)] border-[#34d6a066] hover:border-[var(--em)] disabled:opacity-50"
          >
            Simulate cache hit (warm)
          </button>
          <button 
            onClick={() => triggerSimulation('MISS')}
            disabled={isSimulating}
            className="luxe-btn text-[var(--amber)] border-[#f0b44c66] hover:border-[var(--amber)] disabled:opacity-50"
          >
            Simulate cache miss (cold)
          </button>
        </div>
      </div>

      {/* 6 Step Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[20px] my-[48px] mb-[40px]">
        {/* Step 1 */}
        <div className={`luxe-step ${activeStep >= 0 ? 'lit' : ''}`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 1</small>
          <b className="block text-[17px] text-white">Client Device</b>
          <span className="text-[var(--mut)] text-[14px]">HTTP GET /{simulatedPath.code}</span>
        </div>

        {/* Step 2 */}
        <div className={`luxe-step ${activeStep >= 1 ? 'lit' : ''}`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 2</small>
          <b className="block text-[17px] text-white">Nginx Proxy</b>
          <span className="text-[var(--mut)] text-[14px]">:8080 Load Balancer</span>
        </div>

        {/* Step 3 */}
        <div className={`luxe-step ${activeStep >= 2 ? 'lit' : ''}`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 3</small>
          <b className="block text-[17px] text-white">Token Bucket</b>
          <span className="text-[var(--mut)] text-[14px]">Allowed (Lua Script)</span>
        </div>

        {/* Step 4 */}
        <div className={`luxe-step ${
          activeStep >= 3 
            ? isMissSimulation 
              ? 'miss lit' 
              : 'lit' 
            : ''
        }`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 4</small>
          <b className="block text-[17px] text-white">
            Redis Cache
            <i className={`font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-[8px] ml-1.5 not-italic ${
              isHit 
                ? 'bg-[#34d6a022] text-[var(--em)]' 
                : 'bg-[#f0b44c22] text-[var(--amber)]'
            }`}>
              {simulatedPath.cache}
            </i>
          </b>
          <span className="text-[var(--mut)] text-[14px]">
            {isHit ? 'Served in ~1.8ms' : 'Not found — fetching origin'}
          </span>
        </div>

        {/* Step 5 */}
        <div className={`luxe-step ${
          activeStep >= 4 
            ? isMissSimulation 
              ? 'miss lit' 
              : 'lit' 
            : ''
        }`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 5</small>
          <b className="block text-[17px] text-white">PostgreSQL 16</b>
          <span className="text-[var(--mut)] text-[14px]">
            {isHit ? 'Bypassed (Hot Cache)' : 'Queried, cache warmed'}
          </span>
        </div>

        {/* Step 6 */}
        <div className={`luxe-step ${activeStep >= 5 ? 'lit' : ''}`}>
          <small className="block text-[var(--mut)] font-mono text-[12px] font-medium mb-[22px]">Step 6</small>
          <b className="block text-[17px] text-white">Redis Streams</b>
          <span className="text-[var(--mut)] text-[14px]">clicks:events (Async)</span>
        </div>
      </div>

      {/* Response Strip */}
      <div className="flex flex-wrap gap-[20px_36px] items-center border-t border-[var(--line)] pt-[30px] font-mono text-[14px] text-[var(--mut)]">
        <span>
          HTTP Response: <i className="not-italic bg-[#34d6a022] rounded-[8px] px-3 py-[3px] text-[var(--em)] font-semibold ml-1">302 Found</i>
        </span>
        <span>
          X-Cache: <em className="not-italic text-[var(--em)] font-semibold ml-1">{simulatedPath.cache}</em>
        </span>
        <span>
          X-Served-By: <em className="not-italic text-[var(--em)] font-semibold ml-1">{simulatedPath.servedBy}</em>
        </span>
        <span>
          {simulatedPath.latency}ms
        </span>
        <span className="sm:ml-auto text-[13px] text-[var(--mut)]">
          Non-blocking async click event published to worker group
        </span>
      </div>
    </div>
  );
};
