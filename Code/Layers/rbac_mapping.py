RBAC_MAPPING = {
    "/users": {
        "GET": ["Users.view"]
    },
    "/users/{user_id}": {
        "GET": ["Users.view"],
        "PUT": ["Users.manage"],
    }
}
