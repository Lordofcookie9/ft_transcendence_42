# Makefile

NAME = transcendence
DB_PATH = $(PWD)/db

# Build only
all:
	docker build -t $(NAME) .

# Build and run
up: all
	-docker run -it --init --rm \
		--name $(NAME) \
		-p 443:443 \
		-v $(DB_PATH):/app/db \
		$(NAME)

# Stop and remove container
down:
	-docker stop $(NAME) || true
	-docker rm $(NAME) || true

# Stop, remove container and image
prune: down
	-docker rmi $(NAME) || true
