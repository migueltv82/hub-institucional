import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createSourceFileStorageHandler } from './handler.js'

Deno.serve(createSourceFileStorageHandler({ createClient, env: (name: string) => Deno.env.get(name) }))
