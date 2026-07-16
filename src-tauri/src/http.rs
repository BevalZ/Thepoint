use std::sync::LazyLock;

static DEFAULT_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

pub fn client() -> &'static reqwest::Client {
    &DEFAULT_CLIENT
}

#[cfg(test)]
pub fn client_identity() -> usize {
    client() as *const reqwest::Client as usize
}

#[cfg(test)]
mod tests {
    #[test]
    fn shared_client_identity_is_stable() {
        assert_eq!(super::client_identity(), super::client_identity());
    }
}
