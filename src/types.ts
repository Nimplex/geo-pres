export interface City {
    identifier: string;
    name: string;
    powiat: string;
    areaHa: number;
    areaKm: number;
    totalPopulation: number;
    populationPerKm: number;
    voivodeship?: string;
}
