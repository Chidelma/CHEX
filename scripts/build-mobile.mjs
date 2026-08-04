// Build the native CHEX libraries the iOS, Android, and Flutter clients link.
//
//   bun ./scripts/build-mobile.mjs ios         -> dist-mobile/Chex.xcframework
//   bun ./scripts/build-mobile.mjs android     -> dist-mobile/jniLibs/<abi>/libchex.so
//   bun ./scripts/build-mobile.mjs ios android
//
// iOS needs Xcode's command line tools; Android needs ANDROID_NDK_HOME. Neither
// is required to build the CLI or the Wasm module, so this is a separate script.

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { cargo, toolchainEnv } from './cargo.mjs'

const IOS = [
    { target: 'aarch64-apple-ios', slice: 'device' },
    { target: 'aarch64-apple-ios-sim', slice: 'simulator-arm64' },
    { target: 'x86_64-apple-ios', slice: 'simulator-x86_64' },
]

// Rust target -> the ABI directory name Android expects under jniLibs/.
const ANDROID = [
    { target: 'aarch64-linux-android', abi: 'arm64-v8a' },
    { target: 'armv7-linux-androideabi', abi: 'armeabi-v7a' },
    { target: 'x86_64-linux-android', abi: 'x86_64' },
]

const platforms = process.argv.slice(2)
if (platforms.length === 0) {
    console.error('usage: bun ./scripts/build-mobile.mjs [ios] [android]')
    process.exit(1)
}

await mkdir('dist-mobile', { recursive: true })
if (platforms.includes('ios')) await buildIos()
if (platforms.includes('android')) await buildAndroid()

async function buildIos() {
    await requireCommand('xcodebuild', 'Xcode command line tools are required for the iOS build')
    for (const { target } of IOS) await addTarget(target)

    // A static library per target; no jni-bindings, iOS uses the C ABI.
    for (const { target } of IOS) {
        await cargo(['build', '--release', '--locked', '--lib', '--target', target])
    }

    // The two simulator slices share a platform, so they must be one fat binary.
    const simulator = 'target/chex-ios-simulator.a'
    await run('lipo', [
        '-create',
        'target/aarch64-apple-ios-sim/release/libchex.a',
        'target/x86_64-apple-ios/release/libchex.a',
        '-output',
        simulator,
    ])

    const framework = 'dist-mobile/Chex.xcframework'
    await rm(framework, { recursive: true, force: true })
    await run('xcodebuild', [
        '-create-xcframework',
        '-library', 'target/aarch64-apple-ios/release/libchex.a',
        '-headers', 'include',
        '-library', simulator,
        '-headers', 'include',
        '-output', framework,
    ])
    console.log(`${framework} — device + simulator`)
}

async function buildAndroid() {
    const ndk = process.env.ANDROID_NDK_HOME
    if (!ndk) throw new Error('set ANDROID_NDK_HOME to your NDK installation')

    const host = process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64'
    const bin = join(ndk, 'toolchains/llvm/prebuilt', host, 'bin')

    for (const { target, abi } of ANDROID) {
        await addTarget(target)
        // API 21 is the current Flutter/Android minimum.
        const linker = join(bin, `${linkerPrefix(target)}21-clang`)
        const key = `CARGO_TARGET_${target.toUpperCase().replaceAll('-', '_')}_LINKER`
        await cargo(
            ['build', '--release', '--locked', '--lib', '--features', 'jni-bindings', '--target', target],
            { [key]: linker, AR: join(bin, 'llvm-ar') }
        )
        const out = `dist-mobile/jniLibs/${abi}`
        await mkdir(out, { recursive: true })
        await run('cp', [`target/${target}/release/libchex.so`, `${out}/libchex.so`])
        console.log(`${out}/libchex.so`)
    }
}

// armv7's clang driver is named for the eabi variant, not the Rust triple.
function linkerPrefix(target) {
    return target === 'armv7-linux-androideabi' ? 'armv7a-linux-androideabi' : target
}

async function addTarget(target) {
    await run('rustup', ['target', 'add', target])
}

async function requireCommand(command, message) {
    const proc = Bun.spawn(['which', command], { stdout: 'ignore', stderr: 'ignore' })
    if ((await proc.exited) !== 0) throw new Error(message)
}

async function run(command, args) {
    const proc = Bun.spawn([command, ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
        env: await toolchainEnv(),
    })
    if ((await proc.exited) !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}
