create or replace view players_with_category with (security_invoker = true) as
select
  p.*,
  extract(year from age(s.cutoff_date, p.birth_date))::int as edad_liga,
  c.division,
  c.name as category_name,
  case
    when c.id is not null
    then extract(year from age(s.cutoff_date, p.birth_date))::int - c.min_edad_liga + 1
  end as category_year,
  c.id as category_id,
  t.id as team_id,
  t.name as team_name,
  coalesce(pps.payment_state, 'sin_pagos') as payment_state,
  (
    select count(*)::int
    from documents d
    where d.player_id = p.id
      and d.tenant_id = p.tenant_id
      and d.status in ('fisico', 'digital')
  ) as docs_delivered
from players p
left join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int between c.min_edad_liga and c.max_edad_liga
left join team_players tp on tp.player_id = p.id and tp.season_id = s.id
left join teams t on t.id = tp.team_id
left join player_payment_status pps on pps.player_id = p.id;
