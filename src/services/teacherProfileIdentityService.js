import { supabase } from '../lib/supabase.js'

export const TEACHER_PROFILE_LINK_CANDIDATES_RPC = 'academic_admin_get_teacher_profile_link_candidates'
export const TEACHER_PROFILE_LINK_RPC = 'academic_admin_link_teacher_record_profile'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function requireClient(client) {
  if (!client || typeof client.rpc !== 'function') {
    throw new Error('TEACHER_PROFILE_IDENTITY_SUPABASE_UNAVAILABLE')
  }
}

function normalizeError(error, fallback) {
  const code = clean(error?.code) || fallback
  const message = clean(error?.message) || 'No se pudo completar la operacion de identidad docente.'
  return new Error(`${code}:${message}`)
}

export async function getTeacherProfileLinkCandidates({ institutionId } = {}, { client = supabase } = {}) {
  requireClient(client)
  if (!clean(institutionId)) throw new Error('TEACHER_PROFILE_IDENTITY_INSTITUTION_REQUIRED')
  const { data, error } = await client.rpc(TEACHER_PROFILE_LINK_CANDIDATES_RPC, {
    p_institution_id: clean(institutionId),
  })
  if (error) throw normalizeError(error, 'TEACHER_PROFILE_IDENTITY_CANDIDATES_FAILED')

  return {
    source: clean(data?.source),
    institutionId: clean(data?.institutionId),
    profiles: asArray(data?.profiles).map((row) => ({
      profileId: clean(row.profileId),
      displayName: clean(row.displayName),
      linkedTeacherRecordId: clean(row.linkedTeacherRecordId),
    })),
    teacherRecords: asArray(data?.teacherRecords).map((row) => ({
      teacherRecordId: clean(row.teacherRecordId),
      displayName: clean(row.displayName),
      status: clean(row.status),
      profileId: clean(row.profileId),
    })),
    diagnostics: {
      unlinkedProfiles: Number(data?.diagnostics?.unlinkedProfiles) || 0,
      unlinkedTeacherRecords: Number(data?.diagnostics?.unlinkedTeacherRecords) || 0,
      automaticMatchingUsed: data?.diagnostics?.automaticMatchingUsed === true,
    },
  }
}

export async function linkTeacherRecordProfile({ teacherRecordId, profileId, reason } = {}, { client = supabase } = {}) {
  requireClient(client)
  if (!clean(teacherRecordId) || !clean(profileId)) throw new Error('TEACHER_PROFILE_IDENTITY_IDS_REQUIRED')
  if (!clean(reason)) throw new Error('TEACHER_PROFILE_IDENTITY_REASON_REQUIRED')
  const { data, error } = await client.rpc(TEACHER_PROFILE_LINK_RPC, {
    p_teacher_record_id: clean(teacherRecordId),
    p_profile_id: clean(profileId),
    p_reason: clean(reason),
  })
  if (error) throw normalizeError(error, 'TEACHER_PROFILE_IDENTITY_LINK_FAILED')
  return {
    status: clean(data?.status),
    teacherRecordId: clean(data?.teacherRecordId),
    profileId: clean(data?.profileId),
    institutionId: clean(data?.institutionId),
  }
}
