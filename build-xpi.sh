rm -rf .xpi_work_dir/
rm -f opmlsupport-new.xpi
mkdir .xpi_work_dir
cp -r opmlsupport-new/* .xpi_work_dir/
cd .xpi_work_dir/
rm -rf `find . -name ".git"`
rm -rf `find . -name ".DS_Store"`
rm -rf `find . -name "Thumbs.db"`
zip -rq ~/Desktop/opmlsupport-new.xpi *
cd ..
rm -rf .xpi_work_dir/
