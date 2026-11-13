#!/bin/bash

set -eu

cd "$(dirname "$0")/.."

biome migrate --write
biome check --write src
biome format --write src
