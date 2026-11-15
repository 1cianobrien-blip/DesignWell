-- Low-cost mode: weekly drafting with a draft limit and a monthly spending cap (about £10).
insert into settings (key, value) values
  ('weekly_draft_limit', '20'),
  ('monthly_spend_cap_usd', '12')
on conflict (key) do nothing;

-- The weekly batch needs headroom on its run day; the monthly cap is the real ceiling.
update settings set value = '4' where key = 'daily_spend_cap_usd' and value = '5';
