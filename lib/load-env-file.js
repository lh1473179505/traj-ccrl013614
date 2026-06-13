import fs from 'node:fs';

const parseValue = (rawValue) => {
    const trimmed = rawValue.trim();

    // Handle quoted values: extract content between matching quotes,
    // ignoring anything after the closing quote (e.g. inline comments).
    if (trimmed.startsWith('\'') || trimmed.startsWith('"')) {
        const quote = trimmed[0];
        const closingIndex = trimmed.indexOf(quote, 1);
        if (closingIndex !== -1) {
            return trimmed.slice(1, closingIndex);
        }
    }

    // Handle unquoted values: strip inline comments (whitespace + #).
    const commentIndex = trimmed.search(/\s#/u);
    const value = commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex);
    return value.trim();
};

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
        const key = entry.slice(0, splitIndex);
        const rawValue = entry.slice(splitIndex + 1);
        if (!key) {
            throw new Error(`Missing key before "=" for variable in ${filepath}`);
        }
        result[key] = parseValue(rawValue);
        return result;
    }, {});
};

export default loadEnvFile;
