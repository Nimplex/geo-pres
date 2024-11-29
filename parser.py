import json

f = open('./dane.csv', mode='r', encoding='utf-8')

voivodeships_list: dict[str, list[dict[str, str]]] = {}
current_voivode = ''

for line in f:
    splitted = line.strip().split(sep=',')

    if splitted[0] == '' and splitted[1] != '':
        voivodeship_name = splitted[1].split(sep='(')[0].strip()
        current_voivode = voivodeship_name
        voivodeships_list[voivodeship_name] = []
        continue

    identifier, city_name, powiat, area_ha, area_km, total_population, population_per_km, ranking_in_area_in_ha, ranking_in_population = splitted

    city = {
        'identifier': identifier,
        'name': city_name,
        'powiat': powiat,
        'area_ha': area_ha,
        'area_km': area_km,
        'total_population': total_population,
        'population_per_km': population_per_km,
        'ranking_in_area_in_ha': ranking_in_area_in_ha,
        'ranking_in_population': ranking_in_population
    }

    voivodeships_list[current_voivode].append(city)

open('out.json', mode='w', encoding='utf-8').write(json.dumps(voivodeships_list))