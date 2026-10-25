#!/bin/sh
# Copia o código compartilhado para dentro da função publicada.
set -e
cd "$(dirname "$0")/supabase/functions"
cp _shared/lib.ts _shared/ml.ts _shared/handlers.ts _shared/repo.ts radar/
echo build ok
