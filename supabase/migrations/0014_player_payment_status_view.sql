create view player_payment_status with (security_invoker = true) as
select
  p.id as player_id,
  p.tenant_id,
  case
    when bool_or(pay.status in ('pendiente', 'parcial')) then 'con_adeudo'
    when count(pay.id) = 0 then 'sin_pagos'
    else 'al_corriente'
  end as payment_state
from players p
left join payments pay on pay.player_id = p.id and pay.tenant_id = p.tenant_id
group by p.id, p.tenant_id;
