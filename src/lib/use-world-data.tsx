"use client";

import type { FeatureCollection, Geometry } from "geojson";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
// topojson-client não publica tipos estáveis; suprime só nesta linha.
// @ts-expect-error topojson-client ships no bundled type declarations
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

interface CountryProperties {
  name: string;
  [key: string]: unknown;
}

interface WorldTopology extends Topology {
  objects: {
    [key: string]: GeometryCollection<CountryProperties>;
  };
}

/**
 * Servido pelo próprio app (`public/geo`). Antes vinha de raw.githubusercontent.com,
 * o que quebrava o mapa por dois motivos: a CSP só permite `connect-src 'self'`
 * (mais Supabase/R2/PostHog), e o mapa ficava refém de um host de terceiros.
 */
const WORLD_DATA_URL = "/geo/world-countries.json";

// Global cache to avoid refetching across component mounts
let globalWorldDataCache: FeatureCollection<
  Geometry,
  CountryProperties
> | null = null;
let globalFetchPromise: Promise<FeatureCollection<
  Geometry,
  CountryProperties
> | null> | null = null;

function fetchWorldData(): Promise<FeatureCollection<
  Geometry,
  CountryProperties
> | null> {
  // Return cached data if available
  if (globalWorldDataCache) {
    return Promise.resolve(globalWorldDataCache);
  }

  // Return existing promise if fetch is in progress
  if (globalFetchPromise) {
    return globalFetchPromise;
  }

  // Start new fetch
  globalFetchPromise = (async () => {
    try {
      const response = await fetch(WORLD_DATA_URL);
      if (!response.ok) {
        throw new Error(`World data request failed with ${response.status}`);
      }
      const topology = (await response.json()) as WorldTopology;
      const objectKey = Object.keys(topology.objects)[0];
      if (!objectKey) {
        throw new Error("No objects found in topology");
      }
      const geoObject = topology.objects[objectKey];
      if (!geoObject) {
        throw new Error("Object not found in topology");
      }
      const geojson = feature(
        topology,
        geoObject
      ) as unknown as FeatureCollection<Geometry, CountryProperties>;
      globalWorldDataCache = geojson;
      return geojson;
    } catch (error) {
      console.error("Failed to fetch world data:", error);
      // Sem isso a promise falha fica no cache e o mapa nunca mais tenta de novo.
      globalFetchPromise = null;
      return null;
    }
  })();

  return globalFetchPromise;
}

interface WorldDataContextValue {
  worldData: FeatureCollection<Geometry, CountryProperties> | null;
  isLoading: boolean;
}

const WorldDataContext = createContext<WorldDataContextValue>({
  worldData: null,
  isLoading: true,
});

export function WorldDataProvider({ children }: { children: ReactNode }) {
  const [worldData, setWorldData] = useState<FeatureCollection<
    Geometry,
    CountryProperties
  > | null>(globalWorldDataCache);
  const [isLoading, setIsLoading] = useState(!globalWorldDataCache);

  useEffect(() => {
    // A promise só resolve depois do paint, então setState aqui não causa cascata.
    fetchWorldData().then((data) => {
      setWorldData(data);
      setIsLoading(false);
    });
  }, []);

  return (
    <WorldDataContext.Provider value={{ worldData, isLoading }}>
      {children}
    </WorldDataContext.Provider>
  );
}

export function useWorldData() {
  return useContext(WorldDataContext);
}

// Standalone hook for components that don't have the provider
export function useWorldDataStandalone() {
  const [worldData, setWorldData] = useState<FeatureCollection<
    Geometry,
    CountryProperties
  > | null>(globalWorldDataCache);
  const [isLoading, setIsLoading] = useState(!globalWorldDataCache);

  useEffect(() => {
    // A promise só resolve depois do paint, então setState aqui não causa cascata.
    fetchWorldData().then((data) => {
      setWorldData(data);
      setIsLoading(false);
    });
  }, []);

  return { worldData, isLoading };
}
