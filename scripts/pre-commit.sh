#!/bin/bash

set -eu

cd "$(dirname "$0")/.."

npm run check -- --write
