#!/bin/sh
# Esegue setup.sql e i test di sicurezza su un PostgreSQL locale usa-e-getta.
# Uso: sh supabase/tests/run.sh   (richiede psql e un server PostgreSQL locale)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
DB=elearning_rls_test
PSQL="psql -X -v ON_ERROR_STOP=1 ${PGUSER:+-U $PGUSER}"
dropdb --if-exists $DB ${PGUSER:+-U $PGUSER}
createdb $DB ${PGUSER:+-U $PGUSER}
$PSQL -q -d $DB -f "$DIR/supabase_stubs.sql"
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -d $DB -f "$DIR/../setup.sql"
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -d $DB -f "$DIR/../setup.sql"   # deve poter essere rieseguito
$PSQL -d $DB -f "$DIR/rls_test.sql" 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
dropdb $DB ${PGUSER:+-U $PGUSER}
