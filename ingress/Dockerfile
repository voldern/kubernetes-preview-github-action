FROM nginx:1.21.3

COPY nginx-default.conf.template /etc/nginx/conf.d/default.conf.template

COPY docker-entrypoint.sh /

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]