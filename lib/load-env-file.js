import fs from 'node:fs';

const loadEnvFile = (filepath) => {
    const content = fs.readFileSync(filepath, 'utf8');
    return content.trim().split(/\r?\n/u).reduce((result, line) => {
        const entry = line.trim();
        if (!entry || entry.startsWith('#')) {
            return result;
        }
        const cleaned = entry.startsWith('export ') ? entry.slice(7) : entry;
        const splitIndex = cleaned.indexOf('=');
        if (splitIndex === -1) {
            throw new Error(`Missing "=" for variable in ${filepath}`);
        }
        const key = cleaned.slice(0, splitIndex);
        const value = cleaned.slice(splitIndex + 1);
        if (!key) {
            throw new Error(`Missing key before "=" for variable in ${filepath}`);
        }
        result[key] = (value.startsWith('\'') && value.endsWith('\'')) ? value.slice(1, -1) : value;
        return result;
    }, {});
};

export default loadEnvFile;
