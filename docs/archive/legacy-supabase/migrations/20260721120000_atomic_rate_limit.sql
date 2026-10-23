-- Rate limiting atomico: substitui o padrao read-then-update da aplicacao, que
-- permitia rajadas acima do limite quando varias requisicoes concorrentes liam
-- a mesma contagem antes de qualquer uma gravar.
--
-- A janela e fixa: o primeiro hit define expires_at e os hits seguintes apenas
-- incrementam ate a janela expirar. Isso evita a janela deslizante anterior, que
-- prendia o cliente em bloqueio permanente enquanto ele continuasse tentando.

create or replace function public.consume_rate_limit(p_key text, p_window_ms integer)
returns table (hit_count integer, window_expires_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.rate_limits as r (key, count, expires_at)
  values (p_key, 1, now() + make_interval(secs => greatest(p_window_ms, 1000) / 1000.0))
  on conflict (key) do update
    set count = case when r.expires_at <= now() then 1 else r.count + 1 end,
        expires_at = case
          when r.expires_at <= now() then now() + make_interval(secs => greatest(p_window_ms, 1000) / 1000.0)
          else r.expires_at
        end
  returning r.count, r.expires_at;
$$;

revoke execute on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer) to service_role;

comment on function public.consume_rate_limit(text, integer) is
  'Incrementa e retorna atomicamente a contagem de uma chave de rate limit em janela fixa.';
