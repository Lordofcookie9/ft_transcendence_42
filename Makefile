# Makefile

up:
	docker compose up --build

cleanup:
	docker compose build --no-cache
	docker compose up --force-recreate --remove-orphans

down:
	docker compose down

clean:
	docker compose down -v --rmi all --remove-orphans
	docker system prune -af --volumes

	# docker compose down -v --rmi all --remove-orphans
	# docker system prune -f
	# docker volume prune -f
	# Optional: remove dist files if you're generating them in frontend
	# rm -rf frontend/dist frontend/*.js frontend/*.css
