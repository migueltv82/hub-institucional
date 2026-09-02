import { describe, expect, it } from 'vitest'
import { getStudentProfilePhoto, mergeStudentProfile } from './studentProfile.js'

describe('studentProfile', () => {
  it('recupera la foto persistida dentro del payload original', () => {
    expect(getStudentProfilePhoto({ raw: { photo: 'data:image/jpeg;base64,foto' } }))
      .toBe('data:image/jpeg;base64,foto')
  })

  it('integra el perfil editable sin perder los datos originales', () => {
    expect(mergeStudentProfile(
      { id: 'student-1', carrera: 'Profesorado' },
      { nombre: 'Ana', apellido: 'Diaz', photo: 'data:image/jpeg;base64,foto' },
    )).toMatchObject({
      id: 'student-1',
      carrera: 'Profesorado',
      full_name: 'Ana Diaz',
      photo: 'data:image/jpeg;base64,foto',
      raw: { photo: 'data:image/jpeg;base64,foto' },
    })
  })

  it('elimina todas las variantes antiguas de la foto al limpiar el perfil', () => {
    const student = mergeStudentProfile(
      {
        photo: 'foto-principal',
        foto: 'foto-antigua',
        raw: { photo_url: 'foto-remota', avatar_url: 'avatar-antiguo' },
      },
      { photo: '' },
    )

    expect(getStudentProfilePhoto(student)).toBe('')
  })
})
