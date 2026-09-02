import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('teacher course roster preview route safety', () => {
  it('monta la ruta docente y el panel admin sin tocar el motor ni snapshot', () => {
    const teacherPortal = readFileSync('src/modules/docentes/TeacherPortalModule.jsx', 'utf8')
    const adminWorkspace = readFileSync('src/components/GeneradorCronograma.jsx', 'utf8')
    const service = readFileSync('src/services/teacherCourseRosterPreviewService.js', 'utf8')

    expect(teacherPortal).toContain('docente/cursadas-preview')
    expect(teacherPortal).toContain('isTeacherCourseRosterInternalPreviewEnabled')
    expect(teacherPortal).toContain("lazy(() => import('../../features/teacherCourseRoster/TeacherCourseRosterInternalPreview.jsx'))")
    expect(adminWorkspace).toContain('<TeacherCourseRosterInternalPreview')
    expect(adminWorkspace).toContain("lazy(() => import('../features/teacherCourseRoster/TeacherCourseRosterInternalPreview.jsx'))")
    expect(adminWorkspace).toContain('import.meta.env.DEV && devAuditRoleAuthorized')
    expect(service).toContain('.rpc(')
    expect(service).not.toContain('.from(')
    expect(service).not.toContain('workspaceSnapshot')
    expect(service).not.toContain('service_role')
  })
})
