/* CHEX C ABI — the surface exposed by libchex.a / libchex.dylib / libchex.so
 * and by chex.wasm. Hand-maintained against src/ffi.rs; six functions, no types.
 *
 * One JSON request in, one status out:
 *
 *   request:  {"schema": {...}, "data": {...}, "label": "user.schema.json"}
 *   returns:  0 pass, 1 validation failure, 2 malformed request
 *   output:   on 1 or 2, {"name": "...", "message": "..."} is readable at
 *             chex_result_ptr() for chex_result_len() bytes, until the next call.
 *
 * The caller owns the request buffer. `chex_alloc` is only needed by hosts that
 * cannot write into the library's address space directly (i.e. WebAssembly);
 * native callers pass a pointer to their own bytes.
 */

#ifndef CHEX_H
#define CHEX_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CHEX_ABI_VERSION 1

#define CHEX_OK 0
#define CHEX_FAILED 1
#define CHEX_BAD_REQUEST 2

uint32_t chex_abi_version(void);

uint8_t *chex_alloc(size_t length);
void chex_free(uint8_t *pointer, size_t capacity);

int32_t chex_validate(const uint8_t *pointer, size_t length);

const uint8_t *chex_result_ptr(void);
size_t chex_result_len(void);

#ifdef __cplusplus
}
#endif

#endif /* CHEX_H */
