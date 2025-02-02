import { loadConfig, resolveBindings, resolveProfile } from './config_loader.ts';
import { gzip, isAbsolute, resolve } from './deps_cli.ts';
import { putScript, Binding as ApiBinding } from '../common/cloudflare_api.ts';
import { CLI_VERSION } from './cli_version.ts';
import { Bytes } from '../common/bytes.ts';
import { isValidScriptName } from '../common/config_validation.ts';
import { computeContentsForScriptReference } from './cli_common.ts';
import { Script, Binding, isTextBinding, isSecretBinding, isKVNamespaceBinding, isDONamespaceBinding } from '../common/config.ts';
import { ModuleWatcher } from './module_watcher.ts';

export async function push(args: (string | number)[], options: Record<string, unknown>) {
    const scriptSpec = args[0];
    if (options.help || typeof scriptSpec !== 'string') {
        dumpHelp();
        return;
    }
    const nameFromOptions = typeof options.name === 'string' && options.name.trim().length > 0 ? options.name.trim() : undefined;

    const config = await loadConfig(options);
    const { scriptName, rootSpecifier, script } = await computeContentsForScriptReference(scriptSpec, config, nameFromOptions);
    if (!isValidScriptName(scriptName)) throw new Error(`Bad scriptName: ${scriptName}`);
    const { accountId, apiToken } = await resolveProfile(config, options);
    
    const buildAndPutScript = async () => {
        console.log(`bundling ${scriptName} into bundle.js...`);
        let start = Date.now();
        const result = await Deno.emit(rootSpecifier, { bundle: 'module' });
        console.log(`bundle finished in ${Date.now() - start}ms`);

        if (result.diagnostics.length > 0) {
            console.warn(Deno.formatDiagnostics(result.diagnostics));
            throw new Error('bundle failed');
        }

        const bindings = script ? await computeBindings(script) : [];
        const scriptContentsStr = result.files['deno:///bundle.js'];
        if (typeof scriptContentsStr !== 'string') throw new Error(`bundle.js not found in bundle output files: ${Object.keys(result.files).join(', ')}`);
        const scriptContents = new TextEncoder().encode(scriptContentsStr);
        const compressedScriptContents = gzip(scriptContents);

        console.log(`putting script ${scriptName}... (${Bytes.formatSize(scriptContents.length)}) (${Bytes.formatSize(compressedScriptContents.length)} compressed)`);
        start = Date.now();
        await putScript(accountId, scriptName, scriptContents, bindings, apiToken);
        console.log(`put script ${scriptName} in ${Date.now() - start}ms`);
    }
    await buildAndPutScript();

    const watch = !!options.watch;
    if (watch) {
        console.log('Watching for changes...');
        const scriptUrl = rootSpecifier.startsWith('https://') ? new URL(rootSpecifier) : undefined;
        if (scriptUrl && !scriptUrl.pathname.endsWith('.ts')) throw new Error('Url-based module workers must end in .ts');
        const scriptPathOrUrl = scriptUrl ? scriptUrl.toString() : script ? script.path : isAbsolute(rootSpecifier) ? rootSpecifier : resolve(Deno.cwd(), rootSpecifier);
        const _moduleWatcher = new ModuleWatcher(scriptPathOrUrl, async () => {
            try {
                await buildAndPutScript();
            } catch (e) {
                console.error(e);
            } finally {
                console.log('Watching for changes...');
            }
        });
        return new Promise(() => {});
    }
}

//

async function computeBindings(script: Script): Promise<ApiBinding[]> {
    const resolvedBindings = await resolveBindings(script.bindings || {}, undefined);
    const rt: ApiBinding[] = [];
    for (const [name, binding] of Object.entries(resolvedBindings)) {
        rt.push(computeBinding(name, binding));
    }
    return rt;
}

function computeBinding(name: string, binding: Binding): ApiBinding {
    if (isTextBinding(binding)) {
        return { type: 'plain_text', name, text: binding.value };
    } else if (isSecretBinding(binding)) {
        return { type: 'secret_text', name, text: binding.secret };
    } else if (isKVNamespaceBinding(binding)) {
        return { type: 'kv_namespace', name, namespace_id: binding.kvNamespace };
    } else if (isDONamespaceBinding(binding)) {
        return { type: 'durable_object_namespace', name, namespace_id: binding.doNamespace };
    } else {
        throw new Error(`Unsupported binding ${name}: ${binding}`);
    }
}

function dumpHelp() {
    const lines = [
        `denoflare-push ${CLI_VERSION}`,
        'Upload a worker script to Cloudflare Workers',
        '',
        'USAGE:',
        '    denoflare push [FLAGS] [OPTIONS] [--] [script-spec]',
        '',
        'FLAGS:',
        '    -h, --help        Prints help information',
        '        --verbose     Toggle verbose output (when applicable)',
        '        --watch       Re-upload the worker script when local changes are detected',
        '',
        'OPTIONS:',
        '    -n, --name <name>        Name to use for Cloudflare Worker script [default: Name of script defined in .denoflare config, or https url basename sans extension]',
        '        --profile <name>     Name of profile to load from config (default: only profile or default profile in config)',
        '        --config <path>      Path to config file (default: .denoflare in cwd or parents)',
        '',
        'ARGS:',
        '    <script-spec>    Name of script defined in .denoflare config, file path to bundled js worker, or an https url to a module-based worker .ts, e.g. https://path/to/worker.ts',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
