-- O binário permanece no Storage; Postgres guarda apenas metadados e estado.
-- O limite global do projeto também precisa ser >= 5 GB em Storage Settings.
update storage.buckets
set file_size_limit = 5368709120
where id = 'videos';
