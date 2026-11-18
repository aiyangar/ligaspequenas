drop policy players_delete on public.players;
revoke delete, truncate on public.players from authenticated;
