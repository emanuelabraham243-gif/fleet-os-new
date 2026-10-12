# Access recovery (owner lost both password and phone)

Normal recovery needs nothing from you:

- **Forgot password, phone still works:** "Forgot password" on the sign-in screen (needs the SMS service).
- **Forgot password, SMS not set up yet:** any admin of the company opens **Account → People**, taps
  **Set temporary password** for that person, and tells them the password in person.

This page is for the last case: **the only admin lost the password _and_ the phone number**, so nobody
in the company can sign in to help. Only the system operator (you) does this, from the Supabase
dashboard. Fleet data is never touched -- only the sign-in.

## 0. Prove who they are first

Do this in person. Check their ID against the company's documents (trade licence, Libre in the
company's name). If you are not sure, stop. Whoever you let in can see and change the whole fleet.

## 1. Find the account

Supabase dashboard → **SQL Editor** → new query:

```sql
select u.id as user_id, u.phone, p.full_name, p.role, o.name as company
from auth.users u
join public.profiles p on p.id = u.id
join public.organizations o on o.id = p.organization_id
where o.name ilike '%COMPANY NAME%';
```

Copy the `user_id` of the right person.

## 2. If they have a new phone number, move the account to it

Write the new number as `+2519XXXXXXXX` (or `+2517…`). In `auth.users` it is stored **without** the `+`.

```sql
begin;
update auth.users              set phone = '2519XXXXXXXX', phone_confirmed_at = now() where id = 'USER_ID';
update public.profiles         set phone_e164 = '+2519XXXXXXXX'                       where id = 'USER_ID';
update public.org_phone_members set phone = '+2519XXXXXXXX'                            where user_id = 'USER_ID';
commit;
```

## 3. Set a temporary password and sign out every old session

Make up a temporary password of 8+ characters. You will say it to them in person.

```sql
begin;
update auth.users
  set encrypted_password = extensions.crypt('TEMPORARY-PASSWORD', extensions.gen_salt('bf'))
  where id = 'USER_ID';
delete from auth.sessions where user_id = 'USER_ID';
insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, reason)
  select organization_id, null, 'TEMP_PASSWORD_SET', 'auth', id, 'Operator recovery: lost password and phone'
  from public.profiles where id = 'USER_ID';
commit;
```

## 4. Clean up

- **Delete the query from the SQL Editor's saved snippets/history.** It contains the temporary password.
- If the person was locked out after wrong tries: `delete from private.login_attempts where phone = '+2519XXXXXXXX';`
- They sign in with the number and temporary password, then set their own password under **Account**.

Never send the temporary password by email, Telegram or SMS, and never put it in a ticket or a commit.
