# Makefile

up:
	docker compose up --build

down:
	docker compose down

clean:
	docker compose down -v --rmi all --remove-orphans
	docker system prune -f
	docker volume prune -f
	# Optional: remove dist files if you're generating them in frontend
	# rm -rf frontend/dist frontend/*.js frontend/*.css
