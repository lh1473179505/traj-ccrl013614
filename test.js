import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import camelcase from 'camelcase';
import envy from './index.js';

const fixture = (dir, file = '.env') => {
    return envy(path.join('fixture', dir, file));
};

const monkey = (object, prop) => {
    const original = Object.getOwnPropertyDescriptor(object, prop);

    return () => {
        delete object[prop];
        if (original) {
            Object.defineProperty(object, prop, original);
        }
    };
};

// On Windows, chmod can only produce mode 0o444 (read-only) or 0o666
// (writable), never the 0o600 / 0o555 that the code expects. Simulate
// Unix permissions so the test suite works cross-platform.
const fixtureModeOverrides = {
    'unsafe-perm-env-640/.env'             : 0o640,
    'unsafe-perm-windows-env-777/.env'     : 0o777,
    'unsafe-perm-example-602/.env.example' : 0o602
};
const defaultModeByBasename = {
    '.env'         : 0o600,
    '.env.example' : 0o644
};
const originalStatSync = fs.statSync;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
    process, 'platform'
);

test.before(() => {
    // On Windows, fs.constants.S_IWOTH is undefined. Polyfill it so
    // the world-writable check in index.js works cross-platform.
    if (!('S_IWOTH' in fs.constants)) {
        fs.constants.S_IWOTH = 0o002;
    }

    Object.defineProperty(process, 'platform', {
        configurable : true,
        value        : 'linux'
    });

    fs.statSync = function (filepath, options) {
        const result = originalStatSync.call(fs, filepath, options);
        const normalized = String(filepath).replaceAll('\\', '/');

        for (const [suffix, mode] of Object.entries(fixtureModeOverrides)) {
            if (normalized.endsWith('fixture/' + suffix)) {
                Object.defineProperty(result, 'mode', {
                    value : (result.mode & ~0o777) | mode
                });
                return result;
            }
        }

        const basename = path.basename(String(filepath));
        if (basename in defaultModeByBasename) {
            Object.defineProperty(result, 'mode', {
                value : (result.mode & ~0o777) | defaultModeByBasename[basename]
            });
        }

        return result;
    };
});

test.after(() => {
    if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    fs.statSync = originalStatSync;
});

test('returns camelcased keys', (t) => {
    const env = fixture('normal');
    const keys = Object.keys(env);
    t.is(keys.length, 2);
    for (const key of keys) {
        t.is(key, camelcase(key));
    }
    t.deepEqual(env, {
        myKey : 'my val',
        dog   : 'woof'
    });
});

test('returns excess vars in .env', (t) => {
    t.deepEqual(fixture('excess-env-entry'), {
        myKey : 'my val',
        dog   : 'woof',
        extra : 'awesome'
    });
});

test('returns empty collection of vars', (t) => {
    t.deepEqual(fixture('empty-example'), {});
});

test('can parse complex values', (t) => {
    // Complex values are those which have a high risk of confusing the parser,
    // such as those using reserved characters.
    t.deepEqual(fixture('complex-values'), {
        fakeSecret : 'UG9pbnRsZXNzIHRvIGRlY29kZQ==',
        equation   : '5=10/2',
        number     : '3',
        sentence   : 'Hi there!'
    });
});

test('requires keys for environment variables', (t) => {
    const error = t.throws(() => {
        fixture('missing-key');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'missing-key', '.env');
    t.is(error.message, `Missing key before "=" for variable in ${filepath}`);
});

test('requires env files to be hidden', (t) => {
    const bad = 'env';
    const good = '.' + bad;
    const error = t.throws(() => {
        fixture('normal', bad);
    }, { instanceOf : Error });
    t.is(error.message, `Filepath must be hidden. Fix: mv '${bad}' '${good}'`);
});

test('requires secure file permissions on .env', (t) => {
    const error = t.throws(() => {
        fixture('unsafe-perm-env-640');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'unsafe-perm-env-640', '.env');
    t.is(error.message, `File permissions are unsafe. Fix: chmod 600 '${filepath}'`);
});

test.serial('requires secure file permissions on .env in windows land', (t) => {
    const restore = monkey(process, 'platform');
    Object.defineProperty(process, 'platform', {
        configurable : true,
        value        : 'win32'
    });
    const error = t.throws(() => {
        fixture('unsafe-perm-windows-env-777');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'unsafe-perm-windows-env-777', '.env');
    t.is(error.message, `File permissions are unsafe. Make them 555 '${filepath}'`);

    restore();
});

test('requires secure file permissions on .env.example', (t) => {
    const error = t.throws(() => {
        fixture('unsafe-perm-example-602');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'unsafe-perm-example-602', '.env.example');
    t.is(error.message, `File must not be writable by others. Fix: chmod o-w '${filepath}'`);
});

test('does not modify process.env', (t) => {
    const oldEnvDescriptor = Object.getOwnPropertyDescriptor(process, 'env');
    const oldEnv = process.env;
    const envCopy = Object.create(
        Object.getPrototypeOf(oldEnv),
        Object.getOwnPropertyDescriptors(oldEnv)
    );
    t.deepEqual(fixture('normal'), {
        myKey : 'my val',
        dog   : 'woof'
    });
    t.is(process.env, oldEnv);
    t.deepEqual(process.env, envCopy);
    t.deepEqual(Object.getOwnPropertyDescriptor(process, 'env'), oldEnvDescriptor);
});

test('disallows values in .env.example', (t) => {
    const error = t.throws(() => {
        fixture('example-has-values');
    }, { instanceOf : Error });
    const envPath = path.join('fixture', 'example-has-values', '.env');
    const examplePath = envPath + '.example';
    t.is(error.message, `No values are allowed in ${examplePath}, put them in ${envPath} instead`);
});

test('friendly error if .env.example is not a file', (t) => {
    const error = t.throws(() => {
        fixture('example-not-file');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'example-not-file', '.env.example');
    t.is(error.message, `Filepath must be a file: ${filepath}`);
});

test('friendly error if .env is not a file', (t) => {
    const error = t.throws(() => {
        fixture('env-not-file');
    }, { instanceOf : Error });
    const filepath = path.join('fixture', 'env-not-file', '.env');
    t.is(error.message, `Filepath must be a file: ${filepath}`);
});

test('requires all vars from .env.example', (t) => {
    const error = t.throws(() => {
        fixture('missing-env-entry');
    }, { instanceOf : Error });
    t.is(error.message, 'Environment variables are missing: MISSING, EMPTY');
});

test('empty process.env values fall back to .env file', (t) => {
    const restoreMyKey = monkey(process.env, 'MY_KEY');
    const restoreDog = monkey(process.env, 'DOG');
    process.env.MY_KEY = '';
    process.env.DOG = '';
    t.deepEqual(fixture('normal'), {
        myKey : 'my val',
        dog   : 'woof'
    });
    restoreMyKey();
    restoreDog();
});

test('empty process.env value is treated as missing when .env also lacks it', (t) => {
    const restoreMissing = monkey(process.env, 'MISSING');
    process.env.MISSING = '';
    const error = t.throws(() => {
        fixture('missing-env-entry');
    }, { instanceOf : Error });
    t.is(error.message, 'Environment variables are missing: MISSING, EMPTY');
    restoreMissing();
});

test('non-empty process.env value takes priority over .env', (t) => {
    const restoreMyKey = monkey(process.env, 'MY_KEY');
    const restoreDog = monkey(process.env, 'DOG');
    process.env.MY_KEY = 'from global';
    delete process.env.DOG;
    t.deepEqual(fixture('normal'), {
        myKey : 'from global',
        dog   : 'woof'
    });
    restoreMyKey();
    restoreDog();
});

test('mixed empty and non-empty process.env values', (t) => {
    const restoreMyKey = monkey(process.env, 'MY_KEY');
    const restoreDog = monkey(process.env, 'DOG');
    process.env.MY_KEY = '';
    process.env.DOG = 'global dog';
    t.deepEqual(fixture('normal'), {
        myKey : 'my val',
        dog   : 'global dog'
    });
    restoreMyKey();
    restoreDog();
});
