
"use client";

import type { Node } from '@/lib/types';
import React, { useState, useEffect, useCallback, RefObject } from 'react';

const LOG_SCALE_MIN = 0.02;
const LOG_SCALE_MAX = 1.2;
const LINEAR_SLIDER_MIN_CONST = 0; // Renamed to avoid conflict
const LINEAR_SLIDER_MAX_CONST = 100; // Renamed to avoid conflict

// Helper functions for logarithmic scale conversion
function linearToLogScale(
  linearValue: number,
  linearMin: number,
  linearMax: number,
  logMin: number,
  logMax: number
): number {
  if (logMin <= 0 || logMax <= 0 || !isFinite(logMin) || !isFinite(logMax)) return logMin;
  if (linearMin === linearMax) return logMin;
  if (logMin === logMax) return logMin;

  const G = logMax / logMin;
  if (G <=0 || !isFinite(G)) return logMin; // Avoid Math.log of non-positive
  const exponent = (linearValue - linearMin) / (linearMax - linearMin);
  return logMin * Math.pow(G, exponent);
}

function logToLinearScale(
  logValue: number,
  logMin: number,
  logMax: number,
  linearMin: number,
  linearMax: number
): number {
  if (logValue <= 0 || logMin <= 0 || logMax <= 0 || !isFinite(logValue) || !isFinite(logMin) || !isFinite(logMax) ) return linearMin;
  const clampedLogValue = Math.max(logMin, Math.min(logMax, logValue));
  if (logMin === logMax) return linearMin;
  const G = logMax / logMin;
  if (G === 1 || G <= 0 || !isFinite(G)) return linearMin;
  const logRatio = clampedLogValue / logMin;
  if (logRatio <= 0 || !isFinite(logRatio)) return linearMin; // Avoid Math.log of non-positive
  const logG = Math.log(G);
  if (logG === 0 || !isFinite(logG)) return linearMin;
  return linearMin + (linearMax - linearMin) * (Math.log(logRatio) / logG);
}

interface UseViewportManagerProps {
  containerRef: RefObject<HTMLDivElement>;
  nodes: Node[];
  getNodeDimension: (nodeOrType: Node | Node['type']) => number;
  activeInteractionNodeId: string | null;
  interactionMode: string; 
  initialScale?: number;
  onDimensionsReady?: (width: number, height: number) => void; 
}

export function useViewportManager({
  containerRef,
  nodes,
  getNodeDimension,
  activeInteractionNodeId,
  interactionMode,
  initialScale = 1,
  onDimensionsReady,
}: UseViewportManagerProps) {
  const [scale, setScale] = useState(initialScale);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const [panXSliderLimits, setPanXSliderLimits] = useState({ min: -1000, max: 1000 });
  const [panYSliderLimits, setPanYSliderLimits] = useState({ min: -1000, max: 1000 });

  useEffect(() => {
    let initialDimensionsSet = false;
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerWidth(rect.width);
          setContainerHeight(rect.height);
          if (onDimensionsReady && !initialDimensionsSet) {
            onDimensionsReady(rect.width, rect.height);
            initialDimensionsSet = true;
          }
        }
      }
    };
    measure(); // Initial measure
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [containerRef, onDimensionsReady]);

  useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return;
    if (!containerRef.current || containerWidth === 0 || containerHeight === 0 || scale === 0 || !isFinite(scale)) return;

    const nodesToConsider = nodes.filter(n => n.id !== activeInteractionNodeId);
    let contentMinXWorld, contentMaxXWorld, contentMinYWorld, contentMaxYWorld;

    if (nodesToConsider.length > 0) {
      contentMinXWorld = Math.min(...nodesToConsider.map(n => n.x));
      contentMaxXWorld = Math.max(...nodesToConsider.map(n => n.x + getNodeDimension(n)));
      contentMinYWorld = Math.min(...nodesToConsider.map(n => n.y));
      contentMaxYWorld = Math.max(...nodesToConsider.map(n => n.y + getNodeDimension(n)));
    } else {
      const defaultWorldWidth = (containerWidth || 1) / Math.max(scale, 0.01);
      const defaultWorldHeight = (containerHeight || 1) / Math.max(scale, 0.01);
      contentMinXWorld = -defaultWorldWidth / 2;
      contentMaxXWorld = defaultWorldWidth / 2;
      contentMinYWorld = -defaultWorldHeight / 2;
      contentMaxYWorld = defaultWorldHeight / 2;
    }

    const paddingXWorld = (containerWidth / 2) / Math.max(scale, 0.01);
    const paddingYWorld = (containerHeight / 2) / Math.max(scale, 0.01);
    const contentWorldWidth = contentMaxXWorld - contentMinXWorld;
    const contentWorldHeight = contentMaxYWorld - contentMinYWorld;

    let targetOffsetXIfCentered, targetOffsetYIfCentered;
    
    targetOffsetXIfCentered = (containerWidth / 2) - ((contentMinXWorld + contentMaxXWorld) / 2) * scale;
    targetOffsetYIfCentered = (containerHeight / 2) - ((contentMinYWorld + contentMaxYWorld) / 2) * scale;
    
    const minOffsetX = containerWidth - (contentMaxXWorld * scale) - paddingXWorld * scale;
    const maxOffsetX = -(contentMinXWorld * scale) + paddingXWorld * scale;
    const minOffsetY = containerHeight - (contentMaxYWorld * scale) - paddingYWorld * scale;
    const maxOffsetY = -(contentMinYWorld * scale) + paddingYWorld * scale;

    let finalMinOffsetX, finalMaxOffsetX, finalMinOffsetY, finalMaxOffsetY;

    if (contentWorldWidth * scale <= containerWidth) {
      finalMinOffsetX = targetOffsetXIfCentered;
      finalMaxOffsetX = targetOffsetXIfCentered;
    } else {
      finalMinOffsetX = minOffsetX;
      finalMaxOffsetX = maxOffsetX;
    }
    if (contentWorldHeight * scale <= containerHeight) {
      finalMinOffsetY = targetOffsetYIfCentered;
      finalMaxOffsetY = targetOffsetYIfCentered;
    } else {
      finalMinOffsetY = minOffsetY;
      finalMaxOffsetY = maxOffsetY;
    }

    const newPanXLimits = { min: Math.round(Math.min(finalMinOffsetX, finalMaxOffsetX)), max: Math.round(Math.max(finalMinOffsetX, finalMaxOffsetX)) };
    const newPanYLimits = { min: Math.round(Math.min(finalMinOffsetY, finalMaxOffsetY)), max: Math.round(Math.max(finalMinOffsetY, finalMaxOffsetY)) };

    setPanXSliderLimits(newPanXLimits);
    setPanYSliderLimits(newPanYLimits);

  }, [nodes, scale, containerWidth, containerHeight, activeInteractionNodeId, getNodeDimension, interactionMode, containerRef]);

  useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return;
    const currentVal = offsetX;
    const roundedVal = Math.round(currentVal);
    const minLimit = panXSliderLimits.min;
    const maxLimit = panXSliderLimits.max;
    let clampedRoundedVal = Math.max(minLimit, Math.min(maxLimit, roundedVal));

    if (!isFinite(clampedRoundedVal)) clampedRoundedVal = 0; 

    if (offsetX !== clampedRoundedVal && isFinite(clampedRoundedVal)) {
      setOffsetX(clampedRoundedVal);
    }
  }, [panXSliderLimits, offsetX, activeInteractionNodeId, interactionMode]);

  useEffect(() => {
    if (activeInteractionNodeId || interactionMode === 'pinchZooming') return;
    const currentVal = offsetY;
    const roundedVal = Math.round(currentVal);
    const minLimit = panYSliderLimits.min;
    const maxLimit = panYSliderLimits.max;
    let clampedRoundedVal = Math.max(minLimit, Math.min(maxLimit, roundedVal));
    
    if (!isFinite(clampedRoundedVal)) clampedRoundedVal = 0; 

    if (offsetY !== clampedRoundedVal && isFinite(clampedRoundedVal)) {
      setOffsetY(clampedRoundedVal);
    }
  }, [panYSliderLimits, offsetY, activeInteractionNodeId, interactionMode]);


  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    if (!containerRef.current || scale === 0 || !isFinite(scale)) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const worldX = (screenX - rect.left - offsetX) / scale;
    const worldY = (screenY - rect.top - offsetY) / scale;
    return { x: worldX, y: worldY };
  }, [offsetX, offsetY, scale, containerRef]);

  const handleScaleSliderChange = useCallback((linearValue: number) => {
    const newScaleCandidate = linearToLogScale(linearValue, LINEAR_SLIDER_MIN_CONST, LINEAR_SLIDER_MAX_CONST, LOG_SCALE_MIN, LOG_SCALE_MAX);
    const finalNewScale = Math.max(LOG_SCALE_MIN, Math.min(LOG_SCALE_MAX, newScaleCandidate));

    if (containerRef.current && containerWidth > 0 && containerHeight > 0 && Math.abs(finalNewScale - scale) > 0.0001 && isFinite(finalNewScale) && finalNewScale > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const absScreenCenterX = rect.left + (containerWidth / 2);
      const absScreenCenterY = rect.top + (containerHeight / 2);
      const worldPointAtScreenCenter = screenToWorld(absScreenCenterX, absScreenCenterY);

      const newOffsetX = (containerWidth / 2) - (worldPointAtScreenCenter.x * finalNewScale);
      const newOffsetY = (containerHeight / 2) - (worldPointAtScreenCenter.y * finalNewScale);

      setScale(finalNewScale);
      setOffsetX(Math.round(newOffsetX));
      setOffsetY(Math.round(newOffsetY));
    } else if (Math.abs(finalNewScale - scale) > 0.0001 && isFinite(finalNewScale) && finalNewScale > 0) {
      setScale(finalNewScale);
    }
  }, [containerRef, containerWidth, containerHeight, scale, screenToWorld]);
  
  const handlePanXSliderChange = useCallback((value: number) => {
    setOffsetX(Math.round(value));
  }, []);

  const handlePanYSliderChange = useCallback((value: number) => {
    setOffsetY(Math.round(value));
  }, []);

  const setViewportScale = useCallback((newScale: number, pinchMidpointScreen?: {x: number, y: number}) => {
      const clampedNewScale = Math.max(LOG_SCALE_MIN, Math.min(LOG_SCALE_MAX, newScale));
       if (containerRef.current && containerWidth > 0 && containerHeight > 0 && pinchMidpointScreen) {
            const rect = containerRef.current.getBoundingClientRect();
            const worldPointAtPinchMidpoint = screenToWorld(pinchMidpointScreen.x, pinchMidpointScreen.y); 

            const newOffsetX = pinchMidpointScreen.x - rect.left - (worldPointAtPinchMidpoint.x * clampedNewScale);
            const newOffsetY = pinchMidpointScreen.y - rect.top - (worldPointAtPinchMidpoint.y * clampedNewScale);
            
            setScale(clampedNewScale);
            setOffsetX(Math.round(newOffsetX));
            setOffsetY(Math.round(newOffsetY));
        } else {
            setScale(clampedNewScale);
        }
  }, [containerRef, containerWidth, containerHeight, screenToWorld]);

  const setViewportOffset = useCallback((newOffsetX: number, newOffsetY: number) => {
    setOffsetX(Math.round(newOffsetX));
    setOffsetY(Math.round(newOffsetY));
  }, []);


  return {
    scale,
    offsetX,
    offsetY,
    containerWidth,
    containerHeight,
    panXSliderLimits,
    panYSliderLimits,
    screenToWorld,
    handleScaleSliderChange,
    handlePanXSliderChange,
    handlePanYSliderChange,
    setViewportScale,
    setViewportOffset,
    linearScaleValue: Math.round(logToLinearScale(scale, LOG_SCALE_MIN, LOG_SCALE_MAX, LINEAR_SLIDER_MIN_CONST, LINEAR_SLIDER_MAX_CONST)),
    LOG_SCALE_MIN, 
    LOG_SCALE_MAX,
    LINEAR_SLIDER_MIN: LINEAR_SLIDER_MIN_CONST, // Exporting renamed const
    LINEAR_SLIDER_MAX: LINEAR_SLIDER_MAX_CONST  // Exporting renamed const
  };
}

    