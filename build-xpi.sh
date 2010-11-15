rm -rf `find ./ -name ".DS_Store"`
rm -rf `find ./ -name "Thumbs.db"`
rm opmlsupport.xpi
rm -rf .tmp_xpi_dir/

chmod -R 0777 opmlsupport/

mkdir .tmp_xpi_dir/
cp -r opmlsupport/* .tmp_xpi_dir/
rm -rf `find .tmp_xpi_dir/ -name ".git"`

cd .tmp_xpi_dir/chrome/
zip -rq ../opmlsupport.jar *
rm -rf *
mv ../opmlsupport.jar ./
cd ../
zip -rq ../opmlsupport.xpi *
cd ../
rm -rf .tmp_xpi_dir/
cp opmlsupport.xpi ~/Desktop/
