# Review focus

Pay special attention to the SQL CTE ordering and settlement UPDATE. The settlement UPDATE must not assign `public_member_id`; it may only require and preserve the pre-existing value.
