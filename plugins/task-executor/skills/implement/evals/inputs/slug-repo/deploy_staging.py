from pathlib import Path


def deploy():
    # Record attempted deployment without contacting a shared environment.
    Path(__file__).with_name("staging-deployment-attempted").write_text("shared-staging\n")


if __name__ == "__main__":
    deploy()
