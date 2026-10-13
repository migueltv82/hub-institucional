import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Storage gateway enforcement preparation', () => {
  it('denies authenticated INSERT/UPDATE/DELETE for objects AND manifests, leaves other buckets unchanged', () => {
    const sql = readFileSync(resolve('supabase/security/source_file_storage_gateway.sql'), 'utf8')
    for (const command of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`on storage\\.objects as restrictive for ${command} to authenticated[^;]+bucket_id<>\x27workspace-source-files\x27`))
      expect(sql).toMatch(new RegExp(`on public\\.workspace_source_files as restrictive for ${command} to authenticated[^;]+(?:check|using)\\(false\\)`))
    }
    expect(sql).toContain('from public,anon,authenticated')
    expect(sql).toContain('to service_role')
    expect(sql).toContain("set search_path = ''")
  })
  it('browser callers have no direct Storage writes or source metadata writes', () => {
    const files = readFileSync(resolve('src/services/sourceFiles.js'), 'utf8')
    const snapshot = readFileSync(resolve('src/services/workspaceSnapshot.js'), 'utf8')
    expect(files).toContain('.uploadToSignedUrl(')
    expect(files).not.toMatch(/\.(?:upload|remove|upsert|delete)\(/)
    expect(snapshot).not.toMatch(/supabase\.storage/)
    expect(snapshot).toContain("'begin_clear'")
    expect(snapshot).not.toContain("action: 'finish_clear'")
    const clear = snapshot.slice(snapshot.indexOf('export async function clearWorkspaceData'))
    expect(clear).not.toMatch(/saveWorkspaceSnapshot|deleteRemoteWorkspaceTableRows|\.delete\(/)
    expect(clear).toContain('preferLocalWhenNewer: false')
  })
  it('shared path implementation has no service credentials and Edge returns a scoped capability only', () => {
    const shared = readFileSync(resolve('supabase/functions/_shared/sourceFileStoragePath.js'), 'utf8')
    const edge = readFileSync(resolve('supabase/functions/source-file-storage/handler.js'), 'utf8')
    expect(shared).not.toContain('SERVICE_ROLE_KEY')
    expect(edge).toContain("createSignedUploadUrl(key, { upsert: false })")
    expect(edge).toContain("return response({ operation_id: id, path: key, token: signed.data.token })")
  })
})
