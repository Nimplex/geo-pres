export interface City {
    identifier: string;
    cityName: string;
    powiat: string;
    areaHa: number;
    areaKm: number;
    totalPopulation: number;
    populationPerKm: number;
    voivodeship?: string;
}
