# Planillas de demo (D2)

Datos inventados pero creíbles para mostrar la app: el **Instituto Superior del Valle (demo)**. Personas, DNI y emails son ficticios. Los emails usan el dominio reservado `.invalid`, que nunca recibe correo.

| Archivo | Contenido |
|---|---|
| `demo-academica.xlsx` | 2 carreras (Profesorado de Inglés y Tecnicatura Superior en Enfermería), 20 materias, 7 correlativas y un llamado de diciembre 2026 |
| `demo-docentes.xlsx` | 14 docentes; cada materia tiene su titular y su horario con sede y aula |
| `demo-alumnos.xlsx` | 24 alumnos de 1.º y 2.º año, con 124 inscripciones a materias |
| `demo-historia-academica.xlsx` | Historia de los alumnos de 2.º año: 46 aprobadas (notas de 4 a 10), 8 regulares para rendir en la mesa y 2 libres, para mostrar el rechazo |

**Los `.xlsx` no se versionan**: la auditoría del repo no admite binarios fuera de `public/plantillas`. Para generarlos, desde la carpeta del repo:

```powershell
node scripts/buildDemoWorkbooks.mjs
```

Quedan en esta carpeta, siempre con el mismo contenido. `scripts/buildDemoWorkbooks.test.js` los lee con los mismos parsers que usa la app.

## Orden de carga

Es el mismo del Día D (`docs/DIA_D_CHECKLIST.md`, sección C):

1. Super Admin crea la institución.
2. El admin sube `demo-academica.xlsx` (Inicio), `demo-docentes.xlsx` (Docentes) y `demo-alumnos.xlsx` (Alumnos).
3. En Alumnos, publica el catálogo con `demo-academica.xlsx`.
4. Crea los accesos de alumnos y de docentes.
5. Aplica titularidades e inscribe cursadas.
6. Importa `demo-historia-academica.xlsx`.

**Resultado verificado el 20/10 en un stack local** (Auth, PostgREST, Edge y Storage reales):
- planillas: 20 materias, 14 docentes, 24 alumnos;
- catálogo: 24 de 24 alumnos con plan;
- accesos: 24 alumnos y 14 docentes;
- titularidades y cursadas: 20 y 124, sin errores;
- historia: 56 filas nuevas.

**Credenciales de demo:**
- Alumnos: usuario = email, contraseña = DNI.
- Docentes: usuario = DNI, contraseña = DNI.

En el primer ingreso cada uno elige su contraseña. Ejemplos:
- alumna de 2.º año con una materia regular: Milagros Ortiz, `milagros.ortiz@demo.invalid`, DNI `43914587`;
- docente: Mariana Ferreyra, DNI `24518331`.
