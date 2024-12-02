export interface City {
    identifier: string;
    name: string;
    powiat: string;
    areaHa: number;
    areaKm: number;
    totalPopulation: number;
    populationPerKm: number;
    voivodeship?: string;
    repeating?: boolean;
}

export type Voivodeship = City[];

export type Map<T> = {
    [name: string]: T
};
