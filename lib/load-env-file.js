import fs from 'node:fs';

const loadEnvFile = (filepath) => {
    const content = fs.readFileSync(filepath, 'utf8');
    return content.trim().split(/\r?\n/u).reduce((result, line) => {
        const entry = line.trim();
        if (!entry || entry.startsWith('#')) {
            return result;
        }
        const splitIndex = entry.indexOf('=');
        if (splitIndex === -1) {
            throw new Error(`Missing "=" for variable in ${filepath}`);
        }
        const key = entry.slice(0, splitIndex).trim();
        if (!key) {
            throw new Error(`Missing key before "=" for variable in ${filepath}`);
        }
        const rawValue = entry.slice(splitIndex + 1);
        const trimmedValue = rawValue.trim();
        let value;
        if ((trimmedValue.startsWith('\'') && trimmedValue.endsWith('\'')) ||
            (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))) {
            value = trimmedValue.slice(1, -1);
        }
        else {
            value = trimmedValue;
        }
        result[key] = value;
        return result;
    }, {});
};

export default loadEnvFile;
