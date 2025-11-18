#!/bin/bash

cd client && npm install
cd ../server && npm install


cd ..

mkdir -p server/data

podman-compose up --build -d