// https://gist.github.com/keesey/e09d0af833476385b9ee13b6d26a2b84

/**
 * Calculates the similarity between two strings based on the Levenshtein distance.
 *
 * The similarity is defined as `1.0` when both strings are identical,
 * and approaches `0.0` as the strings become increasingly different.
 *
 * @param {string} s1 - The first string to compare.
 * @param {string} s2 - The second string to compare.
 * @returns {number} A value between `0.0` and `1.0` representing the similarity
 *                   (with `1.0` indicating identical strings and `0.0` indicating no similarity).
 */
export function levenshtein(a: string, b: string): number {
    a = a.toLocaleLowerCase();
    b = b.toLocaleLowerCase();

    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;

    if (an === 0) {
        return bn;
    }

    if (bn === 0) {
        return an;
    }

    const matrix = new Array<number[]>(bn + 1);
    for (let i = 0; i <= bn; ++i) {
        let row = (matrix[i] = new Array<number>(an + 1));
        row[0] = i;
    }

    const firstRow = matrix[0];
    for (let j = 1; j <= an; ++j) {
        firstRow[j] = j;
    }

    for (let i = 1; i <= bn; ++i) {
        for (let j = 1; j <= an; ++j) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] =
                    Math.min(
                        matrix[i - 1][j - 1], // substitution
                        matrix[i][j - 1], // insertion
                        matrix[i - 1][j] // deletion
                    ) + 1;
            }
        }
    }

    const distance = matrix[bn][an];
    const maxLength = Math.max(an, bn);
    const similarity = 100 * (1 - distance / maxLength);

    return similarity;
}
