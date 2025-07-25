all:
	docker build -t transcendence .
	docker run -p 443:443 -v $(PWD)/db:/app/db transcendence
