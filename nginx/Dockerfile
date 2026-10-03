FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

# Placeholder static files — replaced by frontend build in Phase 4
RUN mkdir -p /usr/share/nginx/html && \
    echo '<!doctype html><html><head><meta charset="utf-8"><title>ScaleLink</title></head><body><p>Frontend loading...</p></body></html>' \
    > /usr/share/nginx/html/index.html

EXPOSE 80
